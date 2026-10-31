// =================================================================================================
// GPUGreedyMesher.hlsl
// High-Performance Binary Greedy Mesher for 32x32x32 Voxel Chunks
// Target: HLSL Shader Model 6.0 (DX12 / Vulkan via SPIR-V)
// 
// Vertex Packing: 32-bit Compact Integer Descriptor:
//   Bits  0- 5 (6 bits): X Position [0..32]
//   Bits  6-11 (6 bits): Y Position [0..32]
//   Bits 12-17 (6 bits): Z Position [0..32]
//   Bits 18-20 (3 bits): Normal ID  [0..5] (0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z)
//   Bits 21-22 (2 bits): Ambient Occlusion [0..3]
//   Bits 23-31 (9 bits): Material / Texture ID [0..511]
// =================================================================================================

#define CHUNK_DIM 32
#define CHUNK_SLICE_WORDS 32
#define TOTAL_VOXELS (CHUNK_DIM * CHUNK_DIM * CHUNK_DIM)

cbuffer ChunkMeshConstants : register(b0)
{
    uint3 ChunkOffsetVoxels; // World-space chunk coordinate offset
    uint MaxVertexOutputLimit; // Buffer overflow guard
};

// Input Voxel Buffer (32x32x32 = 32,768 uint16 packed as uint32)
StructuredBuffer<uint> ChunkVoxelBuffer : register(t0);

// Indirect Draw Argument Buffer: [VertexCount, InstanceCount, FirstVertex, FirstInstance]
RWStructuredBuffer<uint> IndirectDrawArgs : register(u0);

// Output Vertex Buffer: 32-bit compact vertex descriptors
RWStructuredBuffer<uint> OutVertexBuffer : register(u1);

// Shared memory for slice row masks and materials
groupshared uint s_RowMask[CHUNK_DIM];
groupshared uint s_MaterialRow[CHUNK_DIM * CHUNK_DIM];

// Helper: Linear index to 3D voxel coordinate
uint3 ToCoord(uint index)
{
    uint x = index & 31u;
    uint y = (index >> 5u) & 31u;
    uint z = (index >> 10u) & 31u;
    return uint3(x, y, z);
}

// Helper: 3D coordinate to linear index
uint ToIndex(uint3 c)
{
    return c.x | (c.y << 5u) | (c.z << 10u);
}

// Fetch 16-bit voxel type from packed uint buffer
uint FetchVoxel(uint3 c)
{
    if (c.x >= CHUNK_DIM || c.y >= CHUNK_DIM || c.z >= CHUNK_DIM)
    {
        return 0u; // Air / Transparent out of bounds
    }
    uint idx = ToIndex(c);
    uint word = ChunkVoxelBuffer[idx >> 1u];
    return (idx & 1u) ? (word >> 16u) : (word & 0xFFFFu);
}

// Compact Vertex Packer
uint PackVertex(uint3 pos, uint normalId, uint ao, uint matId)
{
    return (pos.x & 0x3Fu)
         | ((pos.y & 0x3Fu) << 6u)
         | ((pos.z & 0x3Fu) << 12u)
         | ((normalId & 0x07u) << 18u)
         | ((ao & 0x03u) << 21u)
         | ((matId & 0x1FFu) << 23u);
}

// Dispatch: (x = 32 slices, y = 6 face directions, z = 1)
// ThreadGroup: (32, 1, 1) -> 32 threads cooperate on 1 slice
[numthreads(32, 1, 1)]
void CSMain(
    uint3 groupThreadId : SV_GroupThreadID,
    uint3 groupId : SV_GroupID)
{
    uint sliceIdx = groupId.x; // Slice along axis [0..31]
    uint faceDir  = groupId.y; // 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
    uint threadRow = groupThreadId.x; // Row [0..31] within the 2D slice

    // -------------------------------------------------------------------------
    // Pass 1: Binary Face Mask Extraction
    // Determine visibility: current voxel solid AND neighbor voxel transparent
    // -------------------------------------------------------------------------
    uint rowMask = 0u;

    for (uint col = 0; col < 32u; ++col)
    {
        uint3 currCoord;
        int3 neighborDelta;

        if (faceDir == 0u)      { currCoord = uint3(sliceIdx, threadRow, col); neighborDelta = int3( 1, 0, 0); }
        else if (faceDir == 1u) { currCoord = uint3(sliceIdx, threadRow, col); neighborDelta = int3(-1, 0, 0); }
        else if (faceDir == 2u) { currCoord = uint3(col, sliceIdx, threadRow); neighborDelta = int3( 0, 1, 0); }
        else if (faceDir == 3u) { currCoord = uint3(col, sliceIdx, threadRow); neighborDelta = int3( 0,-1, 0); }
        else if (faceDir == 4u) { currCoord = uint3(col, threadRow, sliceIdx); neighborDelta = int3( 0, 0, 1); }
        else                    { currCoord = uint3(col, threadRow, sliceIdx); neighborDelta = int3( 0, 0,-1); }

        uint currMat = FetchVoxel(currCoord);
        s_MaterialRow[threadRow * 32u + col] = currMat;

        if (currMat != 0u)
        {
            int3 neighborCoord = int3(currCoord) + neighborDelta;
            uint neighborMat = 0u;
            if (neighborCoord.x >= 0 && neighborCoord.x < 32 &&
                neighborCoord.y >= 0 && neighborCoord.y < 32 &&
                neighborCoord.z >= 0 && neighborCoord.z < 32)
            {
                neighborMat = FetchVoxel(uint3(neighborCoord));
            }

            // Face is visible if neighbor is air (voxel type 0)
            if (neighborMat == 0u)
            {
                rowMask |= (1u << col);
            }
        }
    }

    s_RowMask[threadRow] = rowMask;
    GroupMemoryBarrierWithGroupSync();

    // -------------------------------------------------------------------------
    // Pass 2: Binary Greedy Merger & Quad Emission (Thread 0 executes per slice)
    // -------------------------------------------------------------------------
    if (threadRow == 0u)
    {
        for (uint row = 0; row < 32u; ++row)
        {
            while (s_RowMask[row] != 0u)
            {
                // Find first non-zero bit in current row
                uint startCol = firstbitlow(s_RowMask[row]);
                uint startMat = s_MaterialRow[row * 32u + startCol];

                // 1. Expand along width (X/Col direction)
                uint quadWidth = 1u;
                while ((startCol + quadWidth) < 32u)
                {
                    uint colBit = 1u << (startCol + quadWidth);
                    if ((s_RowMask[row] & colBit) == 0u) break;
                    if (s_MaterialRow[row * 32u + (startCol + quadWidth)] != startMat) break;
                    quadWidth++;
                }

                // Bitmask for current horizontal run
                uint colMask = ((1u << quadWidth) - 1u) << startCol;

                // 2. Expand along height (Y/Row direction)
                uint quadHeight = 1u;
                while ((row + quadHeight) < 32u)
                {
                    if ((s_RowMask[row + quadHeight] & colMask) != colMask) break;

                    // Verify all voxels in next row share the same material
                    bool matMatch = true;
                    for (uint c = 0; c < quadWidth; ++c)
                    {
                        if (s_MaterialRow[(row + quadHeight) * 32u + startCol + c] != startMat)
                        {
                            matMatch = false;
                            break;
                        }
                    }
                    if (!matMatch) break;
                    quadHeight++;
                }

                // Clear merged bits from all rows participating in the quad
                for (uint h = 0; h < quadHeight; ++h)
                {
                    s_RowMask[row + h] &= ~colMask;
                }

                // 3. Emit 6 triangle vertices (2 triangles = 1 quad)
                // Reserve 6 vertices in output buffer atomically
                uint baseVertexIdx;
                InterlockedAdd(IndirectDrawArgs[0], 6u, baseVertexIdx);

                if (baseVertexIdx + 6u <= MaxVertexOutputLimit)
                {
                    // Compute quad corners based on face direction
                    uint3 p0, p1, p2, p3;

                    if (faceDir == 0u) // +X
                    {
                        uint fixedX = sliceIdx + 1u;
                        p0 = uint3(fixedX, row,              startCol);
                        p1 = uint3(fixedX, row + quadHeight, startCol);
                        p2 = uint3(fixedX, row + quadHeight, startCol + quadWidth);
                        p3 = uint3(fixedX, row,              startCol + quadWidth);
                    }
                    else if (faceDir == 1u) // -X
                    {
                        uint fixedX = sliceIdx;
                        p0 = uint3(fixedX, row,              startCol + quadWidth);
                        p1 = uint3(fixedX, row + quadHeight, startCol + quadWidth);
                        p2 = uint3(fixedX, row + quadHeight, startCol);
                        p3 = uint3(fixedX, row,              startCol);
                    }
                    else if (faceDir == 2u) // +Y
                    {
                        uint fixedY = sliceIdx + 1u;
                        p0 = uint3(startCol,             fixedY, row + quadHeight);
                        p1 = uint3(startCol + quadWidth, fixedY, row + quadHeight);
                        p2 = uint3(startCol + quadWidth, fixedY, row);
                        p3 = uint3(startCol,             fixedY, row);
                    }
                    else if (faceDir == 3u) // -Y
                    {
                        uint fixedY = sliceIdx;
                        p0 = uint3(startCol,             fixedY, row);
                        p1 = uint3(startCol + quadWidth, fixedY, row);
                        p2 = uint3(startCol + quadWidth, fixedY, row + quadHeight);
                        p3 = uint3(startCol,             fixedY, row + quadHeight);
                    }
                    else if (faceDir == 4u) // +Z
                    {
                        uint fixedZ = sliceIdx + 1u;
                        p0 = uint3(startCol,             row,              fixedZ);
                        p1 = uint3(startCol + quadWidth, row,              fixedZ);
                        p2 = uint3(startCol + quadWidth, row + quadHeight, fixedZ);
                        p3 = uint3(startCol,             row + quadHeight, fixedZ);
                    }
                    else // -Z
                    {
                        uint fixedZ = sliceIdx;
                        p0 = uint3(startCol + quadWidth, row,              fixedZ);
                        p1 = uint3(startCol,             row,              fixedZ);
                        p2 = uint3(startCol,             row + quadHeight, fixedZ);
                        p3 = uint3(startCol + quadWidth, row + quadHeight, fixedZ);
                    }

                    // Pack into 32-bit compact integer descriptors (AO = 3 default)
                    uint v0 = PackVertex(p0, faceDir, 3u, startMat);
                    uint v1 = PackVertex(p1, faceDir, 3u, startMat);
                    uint v2 = PackVertex(p2, faceDir, 3u, startMat);
                    uint v3 = PackVertex(p3, faceDir, 3u, startMat);

                    // Two Triangles: (v0, v1, v2) and (v0, v2, v3)
                    OutVertexBuffer[baseVertexIdx + 0u] = v0;
                    OutVertexBuffer[baseVertexIdx + 1u] = v1;
                    OutVertexBuffer[baseVertexIdx + 2u] = v2;
                    OutVertexBuffer[baseVertexIdx + 3u] = v0;
                    OutVertexBuffer[baseVertexIdx + 4u] = v2;
                    OutVertexBuffer[baseVertexIdx + 5u] = v3;
                }
            }
        }
    }
}
