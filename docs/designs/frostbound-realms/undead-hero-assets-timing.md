# Original Undead hero native asset preview timing

Author: MiYu

This isolated asset preview contains 80 entities. Timings cover native preview, not implementation, conversion, fixture preparation or the whole task. It reuses the existing Release editor.

| Stage | Seconds |
| --- | ---: |
| project open and ready | 1.726 |
| four original source bodies | 8.599 |
| four original portrait cameras | 1.982 |
| Full native preview and owned shutdown | 13.782 |

The first attempt reached the body snapshot but failed its portrait-camera reference assertion; its separate report preserves that evidence. Subsequent checks cover the corrected camera binding and final receipt/layout bytes. The successful editor exited normally and owned disposable data were removed. This asset preview and a 77,125-entity gameplay acceptance have different scopes and do not establish an overall speedup ratio. Original playable hero skills and full gameplay acceptance remain pending.
