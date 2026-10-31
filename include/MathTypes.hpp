#pragma once

#include <cmath>
#include <cstdint>
#include <algorithm>
#include <string>
#include <sstream>

namespace VoxelEngine::Math {

constexpr float PI = 3.14159265358979323846f;
constexpr float TWO_PI = 6.28318530717958647692f;
constexpr float HALF_PI = 1.57079632679489661923f;
constexpr float EPSILON = 1e-6f;

struct alignas(16) Vec3 {
    float x{0.0f};
    float y{0.0f};
    float z{0.0f};
    float w{0.0f}; // Padding for 16-byte alignment and SIMD operations

    constexpr Vec3() = default;
    constexpr Vec3(float inX, float inY, float inZ, float inW = 0.0f) : x(inX), y(inY), z(inZ), w(inW) {}

    [[nodiscard]] constexpr Vec3 operator+(const Vec3& rhs) const noexcept {
        return Vec3(x + rhs.x, y + rhs.y, z + rhs.z);
    }

    [[nodiscard]] constexpr Vec3 operator-(const Vec3& rhs) const noexcept {
        return Vec3(x - rhs.x, y - rhs.y, z - rhs.z);
    }

    [[nodiscard]] constexpr Vec3 operator*(float scalar) const noexcept {
        return Vec3(x * scalar, y * scalar, z * scalar);
    }

    [[nodiscard]] constexpr Vec3 operator/(float scalar) const noexcept {
        float inv = 1.0f / scalar;
        return Vec3(x * inv, y * inv, z * inv);
    }

    constexpr Vec3& operator+=(const Vec3& rhs) noexcept {
        x += rhs.x; y += rhs.y; z += rhs.z;
        return *this;
    }

    constexpr Vec3& operator-=(const Vec3& rhs) noexcept {
        x -= rhs.x; y -= rhs.y; z -= rhs.z;
        return *this;
    }

    constexpr Vec3& operator*=(float scalar) noexcept {
        x *= scalar; y *= scalar; z *= scalar;
        return *this;
    }

    [[nodiscard]] constexpr Vec3 operator-() const noexcept {
        return Vec3(-x, -y, -z);
    }

    [[nodiscard]] constexpr float Dot(const Vec3& rhs) const noexcept {
        return x * rhs.x + y * rhs.y + z * rhs.z;
    }

    [[nodiscard]] constexpr Vec3 Cross(const Vec3& rhs) const noexcept {
        return Vec3(
            y * rhs.z - z * rhs.y,
            z * rhs.x - x * rhs.z,
            x * rhs.y - y * rhs.x
        );
    }

    [[nodiscard]] float LengthSq() const noexcept {
        return x * x + y * y + z * z;
    }

    [[nodiscard]] float Length() const noexcept {
        return std::sqrt(LengthSq());
    }

    [[nodiscard]] Vec3 Normalized() const noexcept {
        float lenSq = LengthSq();
        if (lenSq < EPSILON * EPSILON) {
            return Vec3(0.0f, 1.0f, 0.0f); // Default up vector fallback
        }
        float invLen = 1.0f / std::sqrt(lenSq);
        return Vec3(x * invLen, y * invLen, z * invLen);
    }

    static constexpr Vec3 Zero() noexcept { return Vec3(0.0f, 0.0f, 0.0f); }
    static constexpr Vec3 Up() noexcept { return Vec3(0.0f, 1.0f, 0.0f); }
    static constexpr Vec3 Down() noexcept { return Vec3(0.0f, -1.0f, 0.0f); }
    static constexpr Vec3 Forward() noexcept { return Vec3(0.0f, 0.0f, 1.0f); }
    static constexpr Vec3 Right() noexcept { return Vec3(1.0f, 0.0f, 0.0f); }
};

[[nodiscard]] inline constexpr Vec3 operator*(float scalar, const Vec3& v) noexcept {
    return v * scalar;
}

struct alignas(16) Quat {
    float w{1.0f};
    float x{0.0f};
    float y{0.0f};
    float z{0.0f};

    constexpr Quat() = default;
    constexpr Quat(float inW, float inX, float inY, float inZ) : w(inW), x(inX), y(inY), z(inZ) {}

    static Quat FromAxisAngle(const Vec3& axis, float radians) noexcept {
        Vec3 normAxis = axis.Normalized();
        float halfAngle = radians * 0.5f;
        float s = std::sin(halfAngle);
        return Quat(std::cos(halfAngle), normAxis.x * s, normAxis.y * s, normAxis.z * s);
    }

    [[nodiscard]] constexpr Quat operator*(const Quat& rhs) const noexcept {
        return Quat(
            w * rhs.w - x * rhs.x - y * rhs.y - z * rhs.z,
            w * rhs.x + x * rhs.w + y * rhs.z - z * rhs.y,
            w * rhs.y - x * rhs.z + y * rhs.w + z * rhs.x,
            w * rhs.z + x * rhs.y - y * rhs.x + z * rhs.w
        );
    }

    [[nodiscard]] constexpr Quat Conjugate() const noexcept {
        return Quat(w, -x, -y, -z);
    }

    [[nodiscard]] float LengthSq() const noexcept {
        return w * w + x * x + y * y + z * z;
    }

    [[nodiscard]] Quat Normalized() const noexcept {
        float lenSq = LengthSq();
        if (lenSq < EPSILON * EPSILON) return Quat(1.0f, 0.0f, 0.0f, 0.0f);
        float inv = 1.0f / std::sqrt(lenSq);
        return Quat(w * inv, x * inv, y * inv, z * inv);
    }

    [[nodiscard]] Vec3 Rotate(const Vec3& v) const noexcept {
        Vec3 qv(x, y, z);
        Vec3 uv = qv.Cross(v);
        Vec3 uuv = qv.Cross(uv);
        return v + ((uv * w) + uuv) * 2.0f;
    }

    static Quat Slerp(const Quat& q0, const Quat& inQ1, float t) noexcept {
        Quat q1 = inQ1;
        float dot = q0.w * q1.w + q0.x * q1.x + q0.y * q1.y + q0.z * q1.z;

        // Take shortest path on hypersphere
        if (dot < 0.0f) {
            dot = -dot;
            q1.w = -q1.w;
            q1.x = -q1.x;
            q1.y = -q1.y;
            q1.z = -q1.z;
        }

        if (dot > 0.9995f) {
            // Linear interpolation for small angles to prevent division by zero
            Quat result(
                q0.w + t * (q1.w - q0.w),
                q0.x + t * (q1.x - q0.x),
                q0.y + t * (q1.y - q0.y),
                q0.z + t * (q1.z - q0.z)
            );
            return result.Normalized();
        }

        float theta_0 = std::acos(std::clamp(dot, -1.0f, 1.0f));
        float theta = theta_0 * t;
        float sin_theta = std::sin(theta);
        float sin_theta_0 = std::sin(theta_0);

        float s0 = std::cos(theta) - dot * sin_theta / sin_theta_0;
        float s1 = sin_theta / sin_theta_0;

        return Quat(
            s0 * q0.w + s1 * q1.w,
            s0 * q0.x + s1 * q1.x,
            s0 * q0.y + s1 * q1.y,
            s0 * q0.z + s1 * q1.z
        );
    }

    // Stable quaternion rotation from vector `from` to vector `to`
    static Quat FromTwoVectors(const Vec3& from, const Vec3& to) noexcept {
        Vec3 v0 = from.Normalized();
        Vec3 v1 = to.Normalized();
        float d = v0.Dot(v1);

        if (d >= 1.0f - EPSILON) {
            return Quat(1.0f, 0.0f, 0.0f, 0.0f); // Identity
        }

        if (d <= -1.0f + EPSILON) {
            // Vectors are antipodal (180 degrees apart). Choose any orthogonal axis.
            Vec3 axis = Vec3::Right().Cross(v0);
            if (axis.LengthSq() < EPSILON * EPSILON) {
                axis = Vec3::Up().Cross(v0);
            }
            axis = axis.Normalized();
            return Quat(0.0f, axis.x, axis.y, axis.z);
        }

        Vec3 c = v0.Cross(v1);
        float s = std::sqrt((1.0f + d) * 2.0f);
        float invS = 1.0f / s;

        return Quat(s * 0.5f, c.x * invS, c.y * invS, c.z * invS).Normalized();
    }
};

struct alignas(16) Mat3 {
    float m[3][3]{
        {1.0f, 0.0f, 0.0f},
        {0.0f, 1.0f, 0.0f},
        {0.0f, 0.0f, 1.0f}
    };

    constexpr Mat3() = default;
    constexpr Mat3(
        float m00, float m01, float m02,
        float m10, float m11, float m12,
        float m20, float m21, float m22) {
        m[0][0] = m00; m[0][1] = m01; m[0][2] = m02;
        m[1][0] = m10; m[1][1] = m11; m[1][2] = m12;
        m[2][0] = m20; m[2][1] = m21; m[2][2] = m22;
    }

    [[nodiscard]] constexpr Vec3 operator*(const Vec3& v) const noexcept {
        return Vec3(
            m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
            m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
            m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z
        );
    }

    [[nodiscard]] constexpr Mat3 operator+(const Mat3& rhs) const noexcept {
        Mat3 res;
        for (int r = 0; r < 3; ++r) {
            for (int c = 0; c < 3; ++c) {
                res.m[r][c] = m[r][c] + rhs.m[r][c];
            }
        }
        return res;
    }

    constexpr Mat3& operator+=(const Mat3& rhs) noexcept {
        for (int r = 0; r < 3; ++r) {
            for (int c = 0; c < 3; ++c) {
                m[r][c] += rhs.m[r][c];
            }
        }
        return *this;
    }

    [[nodiscard]] constexpr Mat3 operator*(float scalar) const noexcept {
        Mat3 res;
        for (int r = 0; r < 3; ++r) {
            for (int c = 0; c < 3; ++c) {
                res.m[r][c] = m[r][c] * scalar;
            }
        }
        return res;
    }

    static constexpr Mat3 Zero() noexcept {
        return Mat3(0,0,0, 0,0,0, 0,0,0);
    }

    static constexpr Mat3 Identity() noexcept {
        return Mat3(1,0,0, 0,1,0, 0,0,1);
    }
};

} // namespace VoxelEngine::Math
