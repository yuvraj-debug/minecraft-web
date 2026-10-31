#pragma once

#include "MathTypes.hpp"
#include <cstdint>
#include <vector>
#include <array>
#include <atomic>
#include <mutex>
#include <span>
#include <memory>

namespace VoxelEngine::Core {

constexpr uint32_t CHUNK_SIZE_X = 32;
constexpr uint32_t CHUNK_SIZE_Y = 32;
constexpr uint32_t CHUNK_SIZE_Z = 32;
constexpr uint32_t CHUNK_VOXEL_COUNT = CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z; // 32,768

enum class PaletteBits : uint8_t {
    Bits0 = 0,   // Homogeneous chunk (single block type)
    Bits4 = 4,   // 16 unique materials (2048 uint64 words = 16 KB)
    Bits8 = 8,   // 256 unique materials (4096 uint64 words = 32 KB)
    Bits16 = 16  // 65536 unique materials (8192 uint64 words = 64 KB)
};

struct RLERun {
    uint16_t blockType{0};
    uint16_t length{0};
};

struct alignas(64) ChunkDataBuffer {
    PaletteBits bitsPerVoxel{PaletteBits::Bits0};
    uint16_t homogeneousBlockType{0};
    std::vector<uint16_t> palette;
    std::vector<uint64_t> packedWords;

    [[nodiscard]] uint16_t GetVoxel(uint32_t x, uint32_t y, uint32_t z) const noexcept;
    void SetVoxel(uint32_t x, uint32_t y, uint32_t z, uint16_t blockType);
    void PromoteBits(PaletteBits newBits);
    void RebuildOptimized();
};

class ChunkOctreeBuffer {
public:
    ChunkOctreeBuffer();
    explicit ChunkOctreeBuffer(uint16_t uniformBlockType);
    ~ChunkOctreeBuffer() = default;

    // Non-copyable, movable
    ChunkOctreeBuffer(const ChunkOctreeBuffer&) = delete;
    ChunkOctreeBuffer& operator=(const ChunkOctreeBuffer&) = delete;

    // Lock-free reader: safe for high-frequency concurrent meshing, ray tracing, and physics queries
    [[nodiscard]] uint16_t GetVoxel(uint32_t x, uint32_t y, uint32_t z) const noexcept;
    [[nodiscard]] uint32_t GetRevision() const noexcept { return m_revision.load(std::memory_order_acquire); }

    // Atomic double-buffered write: copy-on-write to back buffer, swap pointer atomically
    // Readers experience ZERO locking or stalls during real-time voxel destruction/building
    void SetVoxel(uint32_t x, uint32_t y, uint32_t z, uint16_t blockType);
    void SetVoxelsBatch(const std::vector<std::pair<Math::Vec3, uint16_t>>& updates);

    // Serialization & Compression pipelines
    [[nodiscard]] std::vector<RLERun> CompressRLE() const;
    void DecompressRLE(std::span<const RLERun> runs);

    // Raw memory view for GPU buffer upload
    void SnapshotToGpuStaging(std::vector<uint16_t>& outVoxelArray) const;

    [[nodiscard]] size_t GetMemoryFootprintBytes() const noexcept;

private:
    alignas(64) std::array<ChunkDataBuffer, 2> m_buffers;
    alignas(64) std::atomic<uint32_t> m_activeBufferIndex{0};
    alignas(64) std::atomic<uint32_t> m_revision{0};
    mutable std::mutex m_writeMutex;
};

} // namespace VoxelEngine::Core
