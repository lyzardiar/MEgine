# 资料片第六章商队暂停

`SetUnitMoveSpeed` 对空或已失效单位无操作；有效单位继续使用既有移动速度数值处理。资料片 `NightElfX06.w3x` 商队中期和胜利前暂停行为遍历全部守卫槽，其中两名法师为空。原地图触发器先查询默认速度，再对空单位设置移动速度，先前因此中止。

固定版 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 的 `SetUnitMoveSpeed` 入口 `0x6f1f7850` 在单位解析失败时直接返回，原指令见 `tmp/docs-artifacts/war3/tft-ne4-next/ne6-speed-asm.txt`。原图最小复现与中断记录为 `ne6-pause-before.log`。

独立 Win32 x86 探针在第六章模拟 140 秒时直接执行原图商队暂停触发器；空槽不再中断，有效凯尔萨斯的速度设置与读取一致，探针继续至 400 秒。日志 `tmp/docs-artifacts/war3/tft-ne4-next/ne6-pause-check.log`。探针提前触发该脚本，并未完成自然商队任务。

待集中验证：空／已移除和有效单位的速度、初始值、上下限、变形及脚本事件；实际商队中期剧情、自然防守与客户端窗口。
