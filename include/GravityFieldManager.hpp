#pragma once

#include "MathTypes.hpp"
#include <vector>
#include <memory>
#include <shared_mutex>
#include <mutex>
#include <cstdint>
#include <optional>

namespace VoxelEngine::Physics {

using namespace Math;

enum class GravityFieldType : uint8_t {
    Radial = 0,         // Spherical planetoids, asteroids, point masses
    Cylindrical = 1,    // Rotating centrifuges, O'Neill cylinder stations
    NegativeVolume = 2, // Antigravity repulsion fields, jump pads
    Directional = 3     // Artificial gravity corridors, wall-running surfaces
};

enum class CylindricalMode : uint8_t {
    CentrifugalOutward = 0, // Rotating station (spin gravity points out toward hull)
    CentripetalInward = 1   // Gravitational filament / wire
};

struct GravityFieldDescriptor {
    uint32_t id{0};
    GravityFieldType type{GravityFieldType::Radial};
    Vec3 position{0.0f, 0.0f, 0.0f};      // Center of field
    Vec3 direction{0.0f, -1.0f, 0.0f};    // Axis for cylindrical / direction for directional
    Quat orientation{1.0f, 0.0f, 0.0f, 0.0f}; // OBB rotation for directional boxes
    Vec3 halfExtents{10.0f, 10.0f, 10.0f}; // Dimensions for box/directional fields

    float innerRadius{10.0f};             // Full strength radius
    float outerRadius{50.0f};             // Zero strength radius
    float surfaceGravity{9.81f};          // Base acceleration (m/s^2)
    float falloffExponent{2.0f};          // 2.0 = inverse square
    float priority{1.0f};                 // Blending priority
    CylindricalMode cylinderMode{CylindricalMode::CentrifugalOutward};
    float cylinderHalfLength{100.0f};     // Extent along cylinder axis
};

struct ClusterVoxel {
    Vec3 localPosition; // Coordinate in meters
    float density;      // kg/m^3 (e.g., Stone: 2600 kg/m^3)
};

struct RigidbodyClusterProperties {
    float totalMass{0.0f};
    Vec3 centerOfMass{0.0f, 0.0f, 0.0f};
    Mat3 inertiaTensor{Mat3::Zero()};
    Mat3 inverseInertiaTensor{Mat3::Zero()};
};

class GravityFieldManager {
public:
    GravityFieldManager() = default;
    ~GravityFieldManager() = default;

    // Non-copyable, movable
    GravityFieldManager(const GravityFieldManager&) = delete;
    GravityFieldManager& operator=(const GravityFieldManager&) = delete;
    GravityFieldManager(GravityFieldManager&&) noexcept = default;
    GravityFieldManager& operator=(GravityFieldManager&&) noexcept = default;

    // Thread-safe field lifecycle management
    uint32_t RegisterField(const GravityFieldDescriptor& desc);
    bool UnregisterField(uint32_t fieldId);
    void ClearAllFields();

    // Query gravity acceleration at world point (thread-safe, lock-free reader via shared_mutex)
    [[nodiscard]] Vec3 CalculateGravityAt(const Vec3& worldPos) const noexcept;

    // Query 3x3 Gravity Gradient Tensor (Tidal force tensor T_ij = d(g_i)/d(x_j))
    [[nodiscard]] Mat3 CalculateGravityGradientTensor(const Vec3& worldPos, float sampleStep = 0.05f) const noexcept;

    // Resolve non-singular 6-DOF character up-vector reorientation quaternion
    // Prevents gimbal lock, camera roll disorientation, and coordinate stutter
    [[nodiscard]] Quat ResolveCharacterOrientation(
        const Quat& currentOrientation,
        const Vec3& characterWorldPos,
        float deltaTime,
        float alignmentSpeed = 8.0f
    ) const noexcept;

    // Calculate physical properties (Mass, Center of Mass, 3D Inertia Tensor) for dynamic detached voxel rigidbodies
    [[nodiscard]] static RigidbodyClusterProperties CalculateClusterPhysics(
        const std::vector<ClusterVoxel>& voxels,
        float voxelSizeMeters = 1.0f
    ) noexcept;

private:
    [[nodiscard]] Vec3 EvaluateSingleField(const GravityFieldDescriptor& field, const Vec3& pos) const noexcept;

    mutable std::shared_mutex m_mutex;
    std::vector<GravityFieldDescriptor> m_fields;
    uint32_t m_nextId{1};
};

} // namespace VoxelEngine::Physics
