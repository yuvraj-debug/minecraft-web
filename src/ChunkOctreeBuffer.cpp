#include "ChunkOctreeBuffer.hpp"
#include <cstring>
#include <algorithm>
#include <stdexcept>

namespace VoxelEngine::Core {

static inline uint32_t ToLinearIndex(uint32_t x, uint32_t y, uint32_t z) noexcept {
    return x + (y * CHUNK_SIZE_X) + (z * (CHUNK_SIZE_X * CHUNK_SIZE_Y));
}

uint16_t ChunkDataBuffer::GetVoxel(uint32_t x, uint32_t y, uint32_t z) const noexcept {
    if (bitsPerVoxel == PaletteBits::Bits0) {
        return homogeneousBlockType;
    }

    uint32_t idx = ToLinearIndex(x, y, z);

    switch (bitsPerVoxel) {
        case PaletteBits::Bits4: {
            uint32_t wordIdx = idx >> 4;
            uint32_t bitOffset = (idx & 15) << 2;
            uint16_t pIdx = static_cast<uint16_t>((packedWords[wordIdx] >> bitOffset) & 0x0F);
            return palette[pIdx];
        }
        case PaletteBits::Bits8: {
            uint32_t wordIdx = idx >> 3;
            uint32_t bitOffset = (idx & 7) << 3;
            uint16_t pIdx = static_cast<uint16_t>((packedWords[wordIdx] >> bitOffset) & 0xFF);
            return palette[pIdx];
        }
        case PaletteBits::Bits16: {
            uint32_t wordIdx = idx >> 2;
            uint32_t bitOffset = (idx & 3) << 4;
            uint16_t pIdx = static_cast<uint16_t>((packedWords[wordIdx] >> bitOffset) & 0xFFFF);
            return palette[pIdx];
        }
        default:
            return 0;
    }
}

void ChunkDataBuffer::PromoteBits(PaletteBits newBits) {
    if (static_cast<uint8_t>(newBits) <= static_cast<uint8_t>(bitsPerVoxel)) {
        return;
    }

    // Extract all current voxels to a temporary uncompressed array
    std::vector<uint16_t> uncompressed(CHUNK_VOXEL_COUNT);
    for (uint32_t z = 0; z < CHUNK_SIZE_Z; ++z) {
        for (uint32_t y = 0; y < CHUNK_SIZE_Y; ++y) {
            for (uint32_t x = 0; x < CHUNK_SIZE_X; ++x) {
                uncompressed[ToLinearIndex(x, y, z)] = GetVoxel(x, y, z);
            }
        }
    }

    bitsPerVoxel = newBits;

    if (newBits == PaletteBits::Bits4) {
        packedWords.assign(CHUNK_VOXEL_COUNT / 16, 0);
        for (uint32_t i = 0; i < CHUNK_VOXEL_COUNT; ++i) {
            uint16_t bType = uncompressed[i];
            auto it = std::find(palette.begin(), palette.end(), bType);
            uint64_t pIdx = (it != palette.end()) ? std::distance(palette.begin(), it) : 0;
            uint32_t wordIdx = i >> 4;
            uint32_t bitOffset = (i & 15) << 2;
            packedWords[wordIdx] |= (pIdx & 0x0F) << bitOffset;
        }
    } else if (newBits == PaletteBits::Bits8) {
        packedWords.assign(CHUNK_VOXEL_COUNT / 8, 0);
        for (uint32_t i = 0; i < CHUNK_VOXEL_COUNT; ++i) {
            uint16_t bType = uncompressed[i];
            auto it = std::find(palette.begin(), palette.end(), bType);
            uint64_t pIdx = (it != palette.end()) ? std::distance(palette.begin(), it) : 0;
            uint32_t wordIdx = i >> 3;
            uint32_t bitOffset = (i & 7) << 3;
            packedWords[wordIdx] |= (pIdx & 0xFF) << bitOffset;
        }
    } else if (newBits == PaletteBits::Bits16) {
        packedWords.assign(CHUNK_VOXEL_COUNT / 4, 0);
        for (uint32_t i = 0; i < CHUNK_VOXEL_COUNT; ++i) {
            uint16_t bType = uncompressed[i];
            auto it = std::find(palette.begin(), palette.end(), bType);
            uint64_t pIdx = (it != palette.end()) ? std::distance(palette.begin(), it) : 0;
            uint32_t wordIdx = i >> 2;
            uint32_t bitOffset = (i & 3) << 4;
            packedWords[wordIdx] |= (pIdx & 0xFFFF) << bitOffset;
        }
    }
}

void ChunkDataBuffer::SetVoxel(uint32_t x, uint32_t y, uint32_t z, uint16_t blockType) {
    if (bitsPerVoxel == PaletteBits::Bits0) {
        if (blockType == homogeneousBlockType) {
            return; // No change
        }
        // Promote from 0-bit homogeneous to 4-bit palette
        palette.clear();
        palette.push_back(homogeneousBlockType); // Index 0
        palette.push_back(blockType);            // Index 1
        bitsPerVoxel = PaletteBits::Bits4;
        packedWords.assign(CHUNK_VOXEL_COUNT / 16, 0); // All initialize to index 0

        uint32_t idx = ToLinearIndex(x, y, z);
        uint32_t wordIdx = idx >> 4;
        uint32_t bitOffset = (idx & 15) << 2;
        packedWords[wordIdx] |= (1ULL << bitOffset); // Set index 1
        return;
    }

    // Check if blockType exists in palette
    auto it = std::find(palette.begin(), palette.end(), blockType);
    uint32_t pIdx = 0;

    if (it != palette.end()) {
        pIdx = static_cast<uint32_t>(std::distance(palette.begin(), it));
    } else {
        uint32_t maxCapacity = 1 << static_cast<uint32_t>(bitsPerVoxel);
        if (palette.size() >= maxCapacity) {
            // Need palette promotion
            if (bitsPerVoxel == PaletteBits::Bits4) {
                PromoteBits(PaletteBits::Bits8);
            } else if (bitsPerVoxel == PaletteBits::Bits8) {
                PromoteBits(PaletteBits::Bits16);
            } else {
                throw std::runtime_error("Exceeded 16-bit palette capacity (65536 materials per chunk)!");
            }
        }
        pIdx = static_cast<uint32_t>(palette.size());
        palette.push_back(blockType);
    }

    uint32_t idx = ToLinearIndex(x, y, z);
    switch (bitsPerVoxel) {
        case PaletteBits::Bits4: {
            uint32_t wordIdx = idx >> 4;
            uint32_t bitOffset = (idx & 15) << 2;
            packedWords[wordIdx] &= ~(0x0FULL << bitOffset);
            packedWords[wordIdx] |= (static_cast<uint64_t>(pIdx) & 0x0F) << bitOffset;
            break;
        }
        case PaletteBits::Bits8: {
            uint32_t wordIdx = idx >> 3;
            uint32_t bitOffset = (idx & 7) << 3;
            packedWords[wordIdx] &= ~(0xFFULL << bitOffset);
            packedWords[wordIdx] |= (static_cast<uint64_t>(pIdx) & 0xFF) << bitOffset;
            break;
        }
        case PaletteBits::Bits16: {
            uint32_t wordIdx = idx >> 2;
            uint32_t bitOffset = (idx & 3) << 4;
            packedWords[wordIdx] &= ~(0xFFFFULL << bitOffset);
            packedWords[wordIdx] |= (static_cast<uint64_t>(pIdx) & 0xFFFF) << bitOffset;
            break;
        }
        default:
            break;
    }
}

ChunkOctreeBuffer::ChunkOctreeBuffer() : ChunkOctreeBuffer(0) {}

ChunkOctreeBuffer::ChunkOctreeBuffer(uint16_t uniformBlockType) {
    m_buffers[0].bitsPerVoxel = PaletteBits::Bits0;
    m_buffers[0].homogeneousBlockType = uniformBlockType;

    m_buffers[1].bitsPerVoxel = PaletteBits::Bits0;
    m_buffers[1].homogeneousBlockType = uniformBlockType;

    m_activeBufferIndex.store(0, std::memory_order_relaxed);
    m_revision.store(1, std::memory_order_relaxed);
}

uint16_t ChunkOctreeBuffer::GetVoxel(uint32_t x, uint32_t y, uint32_t z) const noexcept {
    uint32_t active = m_activeBufferIndex.load(std::memory_order_acquire);
    return m_buffers[active].GetVoxel(x, y, z);
}

void ChunkOctreeBuffer::SetVoxel(uint32_t x, uint32_t y, uint32_t z, uint16_t blockType) {
    std::lock_guard lock(m_writeMutex);

    uint32_t active = m_activeBufferIndex.load(std::memory_order_relaxed);
    uint32_t back = 1 - active;

    // Deep copy active state to back buffer
    m_buffers[back] = m_buffers[active];

    // Mutate back buffer
    m_buffers[back].SetVoxel(x, y, z, blockType);

    // Atomically swap active pointer and publish revision
    m_activeBufferIndex.store(back, std::memory_order_release);
    m_revision.fetch_add(1, std::memory_order_release);
}

void ChunkOctreeBuffer::SetVoxelsBatch(const std::vector<std::pair<Math::Vec3, uint16_t>>& updates) {
    if (updates.empty()) return;

    std::lock_guard lock(m_writeMutex);

    uint32_t active = m_activeBufferIndex.load(std::memory_order_relaxed);
    uint32_t back = 1 - active;

    m_buffers[back] = m_buffers[active];

    for (const auto& [pos, bType] : updates) {
        uint32_t x = static_cast<uint32_t>(pos.x) & (CHUNK_SIZE_X - 1);
        uint32_t y = static_cast<uint32_t>(pos.y) & (CHUNK_SIZE_Y - 1);
        uint32_t z = static_cast<uint32_t>(pos.z) & (CHUNK_SIZE_Z - 1);
        m_buffers[back].SetVoxel(x, y, z, bType);
    }

    m_activeBufferIndex.store(back, std::memory_order_release);
    m_revision.fetch_add(1, std::memory_order_release);
}

std::vector<RLERun> ChunkOctreeBuffer::CompressRLE() const {
    uint32_t active = m_activeBufferIndex.load(std::memory_order_acquire);
    const auto& buf = m_buffers[active];

    std::vector<RLERun> runs;
    if (buf.bitsPerVoxel == PaletteBits::Bits0) {
        runs.push_back(RLERun{buf.homogeneousBlockType, static_cast<uint16_t>(CHUNK_VOXEL_COUNT)});
        return runs;
    }

    uint16_t currentBlock = buf.GetVoxel(0, 0, 0);
    uint16_t currentCount = 1;

    for (uint32_t i = 1; i < CHUNK_VOXEL_COUNT; ++i) {
        uint32_t x = i % CHUNK_SIZE_X;
        uint32_t y = (i / CHUNK_SIZE_X) % CHUNK_SIZE_Y;
        uint32_t z = i / (CHUNK_SIZE_X * CHUNK_SIZE_Y);
        uint16_t bType = buf.GetVoxel(x, y, z);

        if (bType == currentBlock && currentCount < 65535) {
            currentCount++;
        } else {
            runs.push_back(RLERun{currentBlock, currentCount});
            currentBlock = bType;
            currentCount = 1;
        }
    }
    runs.push_back(RLERun{currentBlock, currentCount});
    return runs;
}

void ChunkOctreeBuffer::DecompressRLE(std::span<const RLERun> runs) {
    std::lock_guard lock(m_writeMutex);

    uint32_t active = m_activeBufferIndex.load(std::memory_order_relaxed);
    uint32_t back = 1 - active;

    auto& buf = m_buffers[back];

    if (runs.size() == 1) {
        buf.bitsPerVoxel = PaletteBits::Bits0;
        buf.homogeneousBlockType = runs[0].blockType;
        buf.palette.clear();
        buf.packedWords.clear();
    } else {
        // Collect unique materials
        buf.palette.clear();
        for (const auto& run : runs) {
            if (std::find(buf.palette.begin(), buf.palette.end(), run.blockType) == buf.palette.end()) {
                buf.palette.push_back(run.blockType);
            }
        }

        if (buf.palette.size() <= 16) {
            buf.bitsPerVoxel = PaletteBits::Bits4;
            buf.packedWords.assign(CHUNK_VOXEL_COUNT / 16, 0);
        } else if (buf.palette.size() <= 256) {
            buf.bitsPerVoxel = PaletteBits::Bits8;
            buf.packedWords.assign(CHUNK_VOXEL_COUNT / 8, 0);
        } else {
            buf.bitsPerVoxel = PaletteBits::Bits16;
            buf.packedWords.assign(CHUNK_VOXEL_COUNT / 4, 0);
        }

        uint32_t voxelIdx = 0;
        for (const auto& run : runs) {
            auto it = std::find(buf.palette.begin(), buf.palette.end(), run.blockType);
            uint64_t pIdx = std::distance(buf.palette.begin(), it);

            for (uint32_t count = 0; count < run.length && voxelIdx < CHUNK_VOXEL_COUNT; ++count, ++voxelIdx) {
                if (buf.bitsPerVoxel == PaletteBits::Bits4) {
                    uint32_t wordIdx = voxelIdx >> 4;
                    uint32_t bitOffset = (voxelIdx & 15) << 2;
                    buf.packedWords[wordIdx] |= (pIdx & 0x0F) << bitOffset;
                } else if (buf.bitsPerVoxel == PaletteBits::Bits8) {
                    uint32_t wordIdx = voxelIdx >> 3;
                    uint32_t bitOffset = (voxelIdx & 7) << 3;
                    buf.packedWords[wordIdx] |= (pIdx & 0xFF) << bitOffset;
                } else if (buf.bitsPerVoxel == PaletteBits::Bits16) {
                    uint32_t wordIdx = voxelIdx >> 2;
                    uint32_t bitOffset = (voxelIdx & 3) << 4;
                    buf.packedWords[wordIdx] |= (pIdx & 0xFFFF) << bitOffset;
                }
            }
        }
    }

    m_activeBufferIndex.store(back, std::memory_order_release);
    m_revision.fetch_add(1, std::memory_order_release);
}

void ChunkOctreeBuffer::SnapshotToGpuStaging(std::vector<uint16_t>& outVoxelArray) const {
    outVoxelArray.resize(CHUNK_VOXEL_COUNT);
    uint32_t active = m_activeBufferIndex.load(std::memory_order_acquire);
    const auto& buf = m_buffers[active];

    for (uint32_t z = 0; z < CHUNK_SIZE_Z; ++z) {
        for (uint32_t y = 0; y < CHUNK_SIZE_Y; ++y) {
            for (uint32_t x = 0; x < CHUNK_SIZE_X; ++x) {
                outVoxelArray[ToLinearIndex(x, y, z)] = buf.GetVoxel(x, y, z);
            }
        }
    }
}

size_t ChunkOctreeBuffer::GetMemoryFootprintBytes() const noexcept {
    uint32_t active = m_activeBufferIndex.load(std::memory_order_relaxed);
    const auto& buf = m_buffers[active];
    return sizeof(ChunkOctreeBuffer) 
         + (buf.palette.capacity() * sizeof(uint16_t))
         + (buf.packedWords.capacity() * sizeof(uint64_t));
}

} // namespace VoxelEngine::Core
