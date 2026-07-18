import {
  formatAssetImportSummary,
  getActiveAssetImportFolder,
  importProjectAssetsFromPicker,
} from '../assetImport';
import { registerMenuItem } from './registry';

registerMenuItem(
  'Assets/Import New Assets...',
  async (context) => {
    const targetFolder = getActiveAssetImportFolder();
    try {
      const result = await importProjectAssetsFromPicker(targetFolder);
      const summary = formatAssetImportSummary(result, targetFolder);
      if (summary) context.log(summary);
      if (result.imported.length > 0) context.refresh();
    } catch (error) {
      context.log(`Asset import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  {
    priority: 10,
    separatorBefore: true,
  },
);
