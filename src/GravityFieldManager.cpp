#include "GravityFieldManager.hpp"
#include <algorithm>
#include <cmath>

namespace VoxelEngine::Physics {

static inline float Smoothstep(float edge0, float edge1, float x) noexcept {
    float t = std::clamp((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

uint32_t GravityFieldManager::RegisterField(const GravityFieldDescriptor& desc) {
    std::unique_lock lock(m_mutex);
    uint32_t id = m_nextId++;
    GravityFieldDescriptor field = desc;
    field.id = id;
    m_fields.push_back(field);
    return id;
}

bool GravityFieldManager::UnregisterField(uint32_t fieldId) {
    std::unique_lock lock(m_mutex);
    auto it = std::remove_if(m_fields.begin(), m_fields.end(),
        [fieldId](const GravityFieldDescriptor& f) { return f.id == fieldId; });
    if (it != m_fields.end()) {
        m_fields.erase(it, m_fields.end());
        return true;
    }
    return false;
}

void GravityFieldManager::ClearAllFields() {
    std::unique_lock lock(m_mutex);
    m_fields.clear();
}

Vec3 GravityFieldManager::EvaluateSingleField(const GravityFieldDescriptor& field, const Vec3& pos) const noexcept {
    switch (field.type) {
        case GravityFieldType::Radial: {
            Vec3 delta = pos - field.position;
            float distSq = delta.LengthSq();
            float dist = std::sqrt(distSq);

            if (dist > field.outerRadius || dist < EPSILON) {
                return Vec3::Zero();
            }

            Vec3 dir = delta / dist; // Points outward from center

            if (dist <= field.innerRadius) {
                // Inside planetary body: linear core gravity (Gauss's law for uniform density)
                float ratio = dist / field.innerRadius;
                return dir * (-field.surfaceGravity * ratio);
            } else {
                // Between inner and outer radius: inverse square falloff with smoothstep outer fade
                float normDist = dist / field.innerRadius;
                float falloff = std::pow(1.0f / normDist, field.falloffExponent);
                float fade = 1.0f - Smoothstep(field.innerRadius, field.outerRadius, dist);
                return dir * (-field.surfaceGravity * falloff * fade);
            }
        }

        case GravityFieldType::Cylindrical: {
            Vec3 axis = field.direction.Normalized();
            Vec3 delta = pos - field.position;
            float axialDist = delta.Dot(axis);

            // Check cylinder length extents with smoothstep edge transition
            float absAxial = std::abs(axialDist);
            if (absAxial > field.cylinderHalfLength + 10.0f) {
                return Vec3::Zero();
            }

            float axialFade = 1.0f;
            if (absAxial > field.cylinderHalfLength) {
                axialFade = 1.0f - Smoothstep(field.cylinderHalfLength, field.cylinderHalfLength + 10.0f, absAxial);
            }

            // Radial component perpendicular to cylinder axis
            Vec3 radialVec = delta - axis * axialDist;
            float radDist = radialVec.Length();

            if (radDist < EPSILON || radDist > field.outerRadius) {
                return Vec3::Zero();
            }

            Vec3 radDir = radialVec / radDist;
            float radialFade = 1.0f - Smoothstep(field.innerRadius, field.outerRadius, radDist);

            if (field.cylinderMode == CylindricalMode::CentrifugalOutward) {
                // Simulated gravity in rotating station points outward toward the hull (a = omega^2 * r)
                float ratio = std::clamp(radDist / field.innerRadius, 0.0f, 1.2f);
                return radDir * (field.surfaceGravity * ratio * axialFade * radialFade);
            } else {
                // Filament gravity points inward toward the axis
                float falloff = std::clamp(field.innerRadius / radDist, 0.0f, 2.0f);
                return radDir * (-field.surfaceGravity * falloff * axialFade * radialFade);
            }
        }

        case GravityFieldType::NegativeVolume: {
            // Antigravity repulsion bubble
            Vec3 delta = pos - field.position;
            float dist = delta.Length();
            if (dist >= field.outerRadius || dist < EPSILON) {
                return Vec3::Zero();
            }

            Vec3 repulseDir = delta / dist;
            float t = dist / field.outerRadius;
            float strength = field.surfaceGravity * (1.0f - t) * (1.0f - t);
            return repulseDir * strength; // Points away from center (repulsion)
        }

        case GravityFieldType::Directional: {
            // Oriented Bounding Box conduit
            Quat invRot = field.orientation.Conjugate();
            Vec3 localPos = invRot.Rotate(pos - field.position);

            // Check if point is inside box extents
            if (std::abs(localPos.x) > field.halfExtents.x ||
                std::abs(localPos.y) > field.halfExtents.y ||
                std::abs(localPos.z) > field.halfExtents.z) {
                return Vec3::Zero();
            }

            // Smooth margin near boundaries (1 meter margin)
            float margin = 1.0f;
            float dx = 1.0f - Smoothstep(field.halfExtents.x - margin, field.halfExtents.x, std::abs(localPos.x));
            float dy = 1.0f - Smoothstep(field.halfExtents.y - margin, field.halfExtents.y, std::abs(localPos.y));
            float dz = 1.0f - Smoothstep(field.halfExtents.z - margin, field.halfExtents.z, std::abs(localPos.z));
            float edgeFade = dx * dy * dz;

            Vec3 worldGravityDir = field.orientation.Rotate(field.direction.Normalized());
            return worldGravityDir * (field.surfaceGravity * edgeFade);
        }
    }
    return Vec3::Zero();
}

Vec3 GravityFieldManager::CalculateGravityAt(const Vec3& worldPos) const noexcept {
    std::shared_lock lock(m_mutex);

    Vec3 totalGravity = Vec3::Zero();
    float totalWeight = 0.0f;

    for (const auto& field : m_fields) {
        Vec3 g = EvaluateSingleField(field, worldPos);
        float magSq = g.LengthSq();
        if (magSq > EPSILON) {
            float weight = field.priority;
            totalGravity += g * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight > EPSILON && totalWeight > 1.0f) {
        // Normalize priority-blended overlapping fields to avoid explosive acceleration
        totalGravity = totalGravity / totalWeight;
    }

    return totalGravity;
}

Mat3 GravityFieldManager::CalculateGravityGradientTensor(const Vec3& worldPos, float sampleStep) const noexcept {
    float inv2h = 0.5f / sampleStep;

    Vec3 gx_p = CalculateGravityAt(worldPos + Vec3(sampleStep, 0.0f, 0.0f));
    Vec3 gx_m = CalculateGravityAt(worldPos - Vec3(sampleStep, 0.0f, 0.0f));
    Vec3 dg_dx = (gx_p - gx_m) * inv2h;

    Vec3 gy_p = CalculateGravityAt(worldPos + Vec3(0.0f, sampleStep, 0.0f));
    Vec3 gy_m = CalculateGravityAt(worldPos - Vec3(0.0f, sampleStep, 0.0f));
    Vec3 dg_dy = (gy_p - gy_m) * inv2h;

    Vec3 gz_p = CalculateGravityAt(worldPos + Vec3(0.0f, 0.0f, sampleStep));
    Vec3 gz_m = CalculateGravityAt(worldPos - Vec3(0.0f, 0.0f, sampleStep));
    Vec3 dg_dz = (gz_p - gz_m) * inv2h;

    // Tensor T_ij = d(g_i) / d(x_j)
    return Mat3(
        dg_dx.x, dg_dy.x, dg_dz.x,
        dg_dx.y, dg_dy.y, dg_dz.y,
        dg_dx.z, dg_dy.z, dg_dz.z
    );
}

Quat GravityFieldManager::ResolveCharacterOrientation(
    const Quat& currentOrientation,
    const Vec3& characterWorldPos,
    float deltaTime,
    float alignmentSpeed
) const noexcept {
    Vec3 gravity = CalculateGravityAt(characterWorldPos);
    float gravLenSq = gravity.LengthSq();

    // In microgravity or zero-G (< 0.05 m/s^2), preserve orientation without realignment drift
    if (gravLenSq < 0.0025f) {
        return currentOrientation;
    }

    // Up vector is antiparallel to gravity
    Vec3 targetUp = (-gravity).Normalized();
    Vec3 currentUp = currentOrientation.Rotate(Vec3::Up());

    // Calculate rotation delta required to align current up with target up
    Quat deltaRotation = Quat::FromTwoVectors(currentUp, targetUp);
    Quat targetOrientation = (deltaRotation * currentOrientation).Normalized();

    // Critically damped exponential decay factor: alpha = 1.0 - exp(-speed * dt)
    float blendFactor = 1.0f - std::exp(-alignmentSpeed * deltaTime);
    blendFactor = std::clamp(blendFactor, 0.0f, 1.0f);

    return Quat::Slerp(currentOrientation, targetOrientation, blendFactor);
}

RigidbodyClusterProperties GravityFieldManager::CalculateClusterPhysics(
    const std::vector<ClusterVoxel>& voxels,
    float voxelSizeMeters
) noexcept {
    RigidbodyClusterProperties props{};
    if (voxels.empty()) {
        props.inverseInertiaTensor = Mat3::Identity();
        return props;
    }

    float voxelVolume = voxelSizeMeters * voxelSizeMeters * voxelSizeMeters;
    float voxelSideSq = voxelSizeMeters * voxelSizeMeters;

    // Step 1: Compute Total Mass and Center of Mass
    double totalMassAcc = 0.0;
    double weightedPos[3] = {0.0, 0.0, 0.0};

    for (const auto& v : voxels) {
        float mass = v.density * voxelVolume;
        totalMassAcc += mass;
        weightedPos[0] += mass * v.localPosition.x;
        weightedPos[1] += mass * v.localPosition.y;
        weightedPos[2] += mass * v.localPosition.z;
    }

    if (totalMassAcc < EPSILON) {
        props.totalMass = 1.0f;
        props.inverseInertiaTensor = Mat3::Identity();
        return props;
    }

    props.totalMass = static_cast<float>(totalMassAcc);
    props.centerOfMass = Vec3(
        static_cast<float>(weightedPos[0] / totalMassAcc),
        static_cast<float>(weightedPos[1] / totalMassAcc),
        static_cast<float>(weightedPos[2] / totalMassAcc)
    );

    // Step 2: Compute 3D Inertia Tensor about the Center of Mass
    // I_xx = sum(m * (dy^2 + dz^2) + I_self)
    // I_xy = -sum(m * dx * dy)
    // For a solid cube of side s and mass m, self-inertia is (1/6) * m * s^2 along diagonal
    double Ixx = 0.0, Iyy = 0.0, Izz = 0.0;
    double Ixy = 0.0, Ixz = 0.0, Iyz = 0.0;

    for (const auto& v : voxels) {
        double m = v.density * voxelVolume;
        double dx = v.localPosition.x - props.centerOfMass.x;
        double dy = v.localPosition.y - props.centerOfMass.y;
        double dz = v.localPosition.z - props.centerOfMass.z;

        double selfInertia = (1.0 / 6.0) * m * voxelSideSq;

        Ixx += m * (dy * dy + dz * dz) + selfInertia;
        Iyy += m * (dx * dx + dz * dz) + selfInertia;
        Izz += m * (dx * dx + dy * dy) + selfInertia;

        Ixy -= m * (dx * dy);
        Ixz -= m * (dx * dz);
        Iyz -= m * (dy * dz);
    }

    props.inertiaTensor = Mat3(
        static_cast<float>(Ixx), static_cast<float>(Ixy), static_cast<float>(Ixz),
        static_cast<float>(Ixy), static_cast<float>(Iyy), static_cast<float>(Iyz),
        static_cast<float>(Ixz), static_cast<float>(Iyz), static_cast<float>(Izz)
    );

    // Step 3: Analytical Matrix Inversion for 3x3 Symmetric Positive-Definite Inertia Tensor
    // det(A) = a(ei - fh) - b(di - fg) + c(dh - eg)
    const float (&a)[3][3] = props.inertiaTensor.m;
    float det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
              - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
              + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

    if (std::abs(det) < EPSILON) {
        props.inverseInertiaTensor = Mat3::Identity();
    } else {
        float invDet = 1.0f / det;
        props.inverseInertiaTensor = Mat3(
            (a[1][1] * a[2][2] - a[1][2] * a[2][1]) * invDet,
            (a[0][2] * a[2][1] - a[0][1] * a[2][2]) * invDet,
            (a[0][1] * a[1][2] - a[0][2] * a[1][1]) * invDet,

            (a[1][2] * a[2][0] - a[1][0] * a[2][2]) * invDet,
            (a[0][0] * a[2][2] - a[0][2] * a[2][0]) * invDet,
            (a[0][2] * a[1][0] - a[0][0] * a[1][2]) * invDet,

            (a[1][0] * a[2][1] - a[1][1] * a[2][0]) * invDet,
            (a[0][1] * a[2][0] - a[0][0] * a[2][1]) * invDet,
            (a[0][0] * a[1][1] - a[0][1] * a[1][0]) * invDet
        );
    }

    return props;
}

} // namespace VoxelEngine::Physics
