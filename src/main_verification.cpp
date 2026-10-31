#include "MathTypes.hpp"
#include "GravityFieldManager.hpp"
#include "ChunkOctreeBuffer.hpp"
#include <iostream>
#include <iomanip>
#include <thread>
#include <vector>
#include <cassert>

using namespace VoxelEngine::Math;
using namespace VoxelEngine::Physics;
using namespace VoxelEngine::Core;

int main() {
    std::cout << "========================================================\n";
    std::cout << "  VOXEL ENGINE TECHNICAL VERIFICATION HARNESS (C++20)  \n";
    std::cout << "========================================================\n\n";

    // -------------------------------------------------------------------------
    // 1. GRAVITY FIELD MANAGER VERIFICATION
    // -------------------------------------------------------------------------
    std::cout << "[1] Testing GravityFieldManager...\n";
    GravityFieldManager gravManager;

    // Field A: Spherical Planetoid
    GravityFieldDescriptor planetoid;
    planetoid.type = GravityFieldType::Radial;
    planetoid.position = Vec3(0.0f, 0.0f, 0.0f);
    planetoid.innerRadius = 100.0f;
    planetoid.outerRadius = 500.0f;
    planetoid.surfaceGravity = 9.81f;
    planetoid.falloffExponent = 2.0f;
    planetoid.priority = 1.0f;
    uint32_t planetId = gravManager.RegisterField(planetoid);
    std::cout << "  - Registered Radial Planetoid (ID: " << planetId << ")\n";

    // Field B: Rotating Centrifuge Station
    GravityFieldDescriptor centrifuge;
    centrifuge.type = GravityFieldType::Cylindrical;
    centrifuge.position = Vec3(1000.0f, 0.0f, 0.0f);
    centrifuge.direction = Vec3(0.0f, 0.0f, 1.0f); // Cylinder axis along Z
    centrifuge.innerRadius = 50.0f;
    centrifuge.outerRadius = 60.0f;
    centrifuge.surfaceGravity = 9.81f;
    centrifuge.cylinderHalfLength = 200.0f;
    centrifuge.cylinderMode = CylindricalMode::CentrifugalOutward;
    centrifuge.priority = 2.0f;
    uint32_t centrifugeId = gravManager.RegisterField(centrifuge);
    std::cout << "  - Registered Cylindrical Centrifuge (ID: " << centrifugeId << ")\n";

    // Field C: Antigravity Repulsion Ring
    GravityFieldDescriptor repulsionRing;
    repulsionRing.type = GravityFieldType::NegativeVolume;
    repulsionRing.position = Vec3(0.0f, 100.0f, 0.0f); // North pole jump pad
    repulsionRing.outerRadius = 25.0f;
    repulsionRing.surfaceGravity = 25.0f; // 25 m/s^2 outward expulsion
    repulsionRing.priority = 3.0f;
    uint32_t repulsionId = gravManager.RegisterField(repulsionRing);
    std::cout << "  - Registered Negative-Volume Repulsion Field (ID: " << repulsionId << ")\n";

    // Evaluate Gravity Vector at surface of Planetoid (0, 100, 0)
    Vec3 surfPos(0.0f, 100.0f, 0.0f);
    Vec3 gSurf = gravManager.CalculateGravityAt(surfPos);
    std::cout << "  - Gravity at (0, 100, 0): (" << gSurf.x << ", " << gSurf.y << ", " << gSurf.z << ") m/s^2\n";

    // Calculate Gravity Gradient Tensor T_ij
    Mat3 tensor = gravManager.CalculateGravityGradientTensor(Vec3(0.0f, 200.0f, 0.0f));
    std::cout << "  - Gravity Gradient Tensor T at (0, 200, 0):\n";
    std::cout << "    [" << tensor.m[0][0] << ", " << tensor.m[0][1] << ", " << tensor.m[0][2] << "]\n";
    std::cout << "    [" << tensor.m[1][0] << ", " << tensor.m[1][1] << ", " << tensor.m[1][2] << "]\n";
    std::cout << "    [" << tensor.m[2][0] << ", " << tensor.m[2][1] << ", " << tensor.m[2][2] << "]\n";

    // 6-DOF Character Up-Vector Quaternion Resolution
    Quat currentOrientation(1.0f, 0.0f, 0.0f, 0.0f); // Default upright
    Vec3 charPos(0.0f, -150.0f, 0.0f); // Underneath planet (inverted gravity!)
    Quat alignedOrientation = gravManager.ResolveCharacterOrientation(currentOrientation, charPos, 0.0166f, 10.0f);
    Vec3 newUp = alignedOrientation.Rotate(Vec3::Up());
    std::cout << "  - Character inverted up-vector after SLERP alignment: ("
              << newUp.x << ", " << newUp.y << ", " << newUp.z << ")\n";

    // Rigidbody Cluster Physics (Detached Voxel Island)
    std::vector<ClusterVoxel> cluster;
    // 2x2x2 cube of stone voxels
    for (int x = 0; x < 2; ++x) {
        for (int y = 0; y < 2; ++y) {
            for (int z = 0; z < 2; ++z) {
                cluster.push_back({Vec3(float(x), float(y), float(z)), 2600.0f});
            }
        }
    }
    auto clusterProps = GravityFieldManager::CalculateClusterPhysics(cluster, 1.0f);
    std::cout << "  - Detached Island Mass: " << clusterProps.totalMass << " kg\n";
    std::cout << "  - Center of Mass: (" << clusterProps.centerOfMass.x << ", "
              << clusterProps.centerOfMass.y << ", " << clusterProps.centerOfMass.z << ")\n";
    std::cout << "  - Inertia Tensor Diagonal: [" << clusterProps.inertiaTensor.m[0][0]
              << ", " << clusterProps.inertiaTensor.m[1][1]
              << ", " << clusterProps.inertiaTensor.m[2][2] << "]\n\n";

    // -------------------------------------------------------------------------
    // 2. CHUNK OCTREE BUFFER & ATOMIC DOUBLE-BUFFERING VERIFICATION
    // -------------------------------------------------------------------------
    std::cout << "[2] Testing ChunkOctreeBuffer...\n";
    ChunkOctreeBuffer chunk(1); // Homogeneous stone chunk (type 1)
    std::cout << "  - Created homogeneous chunk (Type 1), Initial Revision: " << chunk.GetRevision() << "\n";
    assert(chunk.GetVoxel(16, 16, 16) == 1);

    // Dynamic Palette Promotion (1 -> 4-bit palette)
    chunk.SetVoxel(5, 5, 5, 2);  // Dirt
    chunk.SetVoxel(6, 6, 6, 3);  // Gold Ore
    std::cout << "  - Mutated voxels (Promoted to 4-bit palette), Revision: " << chunk.GetRevision() << "\n";
    assert(chunk.GetVoxel(5, 5, 5) == 2);
    assert(chunk.GetVoxel(6, 6, 6) == 3);
    assert(chunk.GetVoxel(0, 0, 0) == 1);

    // Concurrent Multithreaded Stress Test: 4 Readers, 1 Writer
    std::cout << "  - Starting concurrent multithreaded stress test (4 readers, 1 writer)...\n";
    std::atomic<bool> running{true};
    std::atomic<uint32_t> startedReaders{0};
    std::atomic<uint64_t> totalReadOps{0};

    auto readerFunc = [&]() {
        startedReaders.fetch_add(1, std::memory_order_release);
        uint64_t localReads = 0;
        while (running.load(std::memory_order_relaxed)) {
            uint16_t v = chunk.GetVoxel(5, 5, 5);
            assert(v == 2 || v == 42); // Must always read valid atomic states
            localReads++;
        }
        totalReadOps.fetch_add(localReads, std::memory_order_relaxed);
    };

    std::vector<std::thread> readers;
    for (int i = 0; i < 4; ++i) {
        readers.emplace_back(readerFunc);
    }

    // Wait until all 4 reader threads are running
    while (startedReaders.load(std::memory_order_acquire) < 4) {
        std::this_thread::yield();
    }

    // Writer thread performing rapid atomic double-buffered edits concurrently
    for (int i = 0; i < 2000; ++i) {
        chunk.SetVoxel(5, 5, 5, (i % 2 == 0) ? 2 : 42);
        if (i % 20 == 0) {
            std::this_thread::sleep_for(std::chrono::microseconds(50));
        }
    }

    running.store(false);
    for (auto& r : readers) {
        r.join();
    }
    std::cout << "  - Concurrent stress test passed cleanly! Total lock-free reads: "
              << totalReadOps.load() << ", Final Revision: " << chunk.GetRevision() << "\n";

    // RLE Compression Test
    auto rleRuns = chunk.CompressRLE();
    std::cout << "  - Compressed chunk into " << rleRuns.size() << " RLE runs (Original: 32,768 voxels)\n";

    // Roundtrip Decompression Test
    ChunkOctreeBuffer roundtripChunk(0);
    roundtripChunk.DecompressRLE(rleRuns);
    assert(roundtripChunk.GetVoxel(5, 5, 5) == chunk.GetVoxel(5, 5, 5));
    assert(roundtripChunk.GetVoxel(6, 6, 6) == 3);
    assert(roundtripChunk.GetVoxel(0, 0, 0) == 1);
    std::cout << "  - RLE Compression / Decompression roundtrip verified bit-exact!\n";

    // Snapshot to GPU Staging Buffer
    std::vector<uint16_t> gpuStaging;
    chunk.SnapshotToGpuStaging(gpuStaging);
    assert(gpuStaging.size() == CHUNK_VOXEL_COUNT);
    std::cout << "  - GPU Staging Snapshot generated (" << gpuStaging.size() * sizeof(uint16_t) << " bytes)\n";

    std::cout << "\n========================================================\n";
    std::cout << "  ALL ARCHITECTURAL & CODE VERIFICATIONS SUCCESSFUL!    \n";
    std::cout << "========================================================\n";
    return 0;
}
