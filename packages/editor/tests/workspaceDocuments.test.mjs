import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gateWorkspaceResourceSelection,
  mergeWorkspaceResourceDocuments,
  resourceEditorDocuments,
} from '../src/workspaceDocuments.ts';

test('resource editor documents distinguish the selected asset from cached drafts', () => {
  assert.deepEqual(
    resourceEditorDocuments(
      'animation',
      'timeline',
      'Assets/Animations/Run.manim',
      false,
      [
        ['Assets/Animations/Idle.manim', true],
        ['assets\\animations\\run.manim', true],
      ],
    ),
    [
      {
        kind: 'animation',
        panel: 'timeline',
        path: 'Assets/Animations/Run.manim',
        dirty: false,
        selected: true,
      },
      {
        kind: 'animation',
        panel: 'timeline',
        path: 'Assets/Animations/Idle.manim',
        dirty: true,
        selected: false,
      },
    ],
  );
});

test('workspace document merging is deterministic and preserves dirty selected state', () => {
  assert.deepEqual(
    mergeWorkspaceResourceDocuments(
      [{
        kind: 'material',
        panel: 'material',
        path: 'Assets/Materials/Hero.mmat',
        dirty: false,
        selected: true,
      }],
      [{
        kind: 'material',
        panel: 'material',
        path: 'assets\\materials\\hero.mmat',
        dirty: true,
        selected: false,
      }],
    ),
    [{
      kind: 'material',
      panel: 'material',
      path: 'Assets/Materials/Hero.mmat',
      dirty: true,
      selected: true,
    }],
  );
});

test('shared panel routes expose only the visible document as selected', () => {
  const documents = [
    {
      kind: 'animation',
      panel: 'timeline',
      path: 'Assets/Animations/Run.manim',
      dirty: true,
      selected: true,
    },
    {
      kind: 'animation',
      panel: 'timeline',
      path: 'Assets/Animations/Idle.manim',
      dirty: false,
      selected: false,
    },
  ];

  assert.deepEqual(gateWorkspaceResourceSelection(documents, false), [
    { ...documents[0], selected: false },
    documents[1],
  ]);
  assert.deepEqual(gateWorkspaceResourceSelection(documents, true), documents);
});
