import { useCallback, useState } from 'react';
import {
  getBehaviour,
  invokeBehaviourMethodEdit,
} from '@mengine/behaviour';
import { SchemaFieldEditor } from '../../panels/SchemaFieldEditor';
import { EditorWindow } from '../EditorWindow';
import { registerMenuItem } from '../registry';
import './DecoratorShowcase';

function GalleryBody() {
  const entry = getBehaviour('__DecoratorShowcase');
  const [data, setData] = useState<Record<string, unknown>>(
    () => entry?.defaults() ?? {},
  );

  const invoke = useCallback(
    (method: string) => {
      const next = invokeBehaviourMethodEdit('__DecoratorShowcase', data, method);
      if (next) setData(next);
    },
    [data],
  );

  if (!entry) {
    return <div className="field-hint">Showcase meta not registered</div>;
  }

  return (
    <div className="decorator-gallery">
      <p className="decorator-gallery-lead">
        字段装饰器预览（本地数据，不写入场景）。修改下方控件可验证 ShowIf / Range / Button 等。
      </p>
      <SchemaFieldEditor
        fields={entry.fields}
        methods={entry.methods}
        data={data}
        onChange={setData}
        onInvokeMethod={invoke}
      />
    </div>
  );
}

/** Window → Decorator Gallery */
export class DecoratorGalleryWindow extends EditorWindow {
  title = 'Decorator Gallery';
  minWidth = 400;
  minHeight = 520;

  static openFromMenu() {
    DecoratorGalleryWindow.show({ width: 440, height: 560 });
  }

  onGUI() {
    return <GalleryBody />;
  }
}

// .tsx 经 Babel 编译，暂不支持 @MenuItem；在此命令式注册
registerMenuItem('Window/Decorator Gallery', () => {
  DecoratorGalleryWindow.openFromMenu();
});
