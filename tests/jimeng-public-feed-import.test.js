const assert = require('node:assert/strict');
const test = require('node:test');
const importer = require('../scripts/import-jimeng-public-feed');

test('parses Jimeng public JSONP feed responses', () => {
  const payload = 'var __get_explore_result = {"ret":"0","data":{"item_list":[{"common_attr":{"id":"123"}}],"next_offset":20,"has_more":true}};typeof cb===\'function\'&&cb();';
  const parsed = importer.parseJsonp(payload);
  assert.equal(parsed.ret, '0');
  assert.equal(parsed.data.item_list[0].common_attr.id, '123');
});

test('extracts complete prompts from Jimeng draft content', () => {
  const item = {
    aigc_draft: {
      content: JSON.stringify({
        component_list: [{
          abilities: {
            generate: {
              core_param: {
                prompt: '未来感东方极简品牌视觉系统设计，画面中包含手提袋、咖啡杯、纸盒包装、品牌卡片和包装贴纸，浅灰背景，自然柔光，现代中式美学，规整排布，细节清晰，适合电商品牌包装系统展示。'
              }
            }
          }
        }]
      })
    }
  };
  const prompt = importer.extractPrompt(item);
  assert.match(prompt, /品牌视觉系统设计/);
});

test('normalizes Jimeng aspect ratios into site labels', () => {
  assert.equal(importer.toAspectRatio(0.5625), '9:16');
  assert.equal(importer.toAspectRatio(1), '1:1');
  assert.equal(importer.toAspectRatio(1.7777), '16:9');
});
