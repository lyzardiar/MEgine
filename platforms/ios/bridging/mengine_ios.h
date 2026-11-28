#ifndef MENGINE_IOS_H
#define MENGINE_IOS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Reserved iOS C-ABI adapter contract (Metal via wgpu + QuickJS script runtime).
uint32_t mengine_ios_init(const char* documents_dir_utf8);
void mengine_ios_on_lifecycle(uint32_t code);
void mengine_ios_on_metal_layer(void* ca_metal_layer, uint32_t width, uint32_t height, float scale_factor);
void mengine_ios_on_safe_area(float top, float right, float bottom, float left);
void mengine_ios_on_touch(uint64_t pointer_id, float x, float y, float pressure, uint32_t phase_code);
uint32_t mengine_ios_tick(float dt_seconds);

#ifdef __cplusplus
}
#endif

#endif // MENGINE_IOS_H
