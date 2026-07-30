const VIDEO_CATEGORY = '视频提示词';

const CATEGORY_RULES = [
  ['赛博朋克', [['cyberpunk', 8], ['赛博朋克', 8], ['dystopian', 5], ['hologram', 4], ['全息', 4], ['neon', 3], ['霓虹', 3]]],
  ['科幻', [['science fiction', 8], ['sci-fi', 8], ['科幻', 8], ['spaceship', 5], ['太空', 5], ['astronaut', 5], ['未来主义', 4], ['futuristic', 4]]],
  ['奇幻', [['fantasy', 8], ['奇幻', 8], ['dragon', 5], ['魔法', 5], ['wizard', 5], ['mythical', 4], ['精灵', 4]]],
  ['建筑', [['architecture', 7], ['建筑', 7], ['interior design', 6], ['室内设计', 6], ['facade', 4], ['空间设计', 4], ['建筑摄影', 4]]],
  ['城市', [['cityscape', 7], ['城市天际线', 7], ['urban street', 5], ['城市街道', 5], ['downtown', 4], ['摩天大楼', 4]]],
  ['风景', [['landscape', 7], ['风景', 7], ['mountain', 5], ['山脉', 5], ['valley', 4], ['海岸', 4], ['sunset', 3], ['日落', 3]]],
  ['自然', [['nature', 7], ['自然', 7], ['forest', 5], ['森林', 5], ['botanical', 4], ['植物', 4], ['flower', 3], ['花卉', 3]]],
  ['动物', [['wildlife', 7], ['动物', 7], ['animal portrait', 7], ['宠物', 5], ['dog', 4], ['犬', 4], ['feline', 4], ['猫咪', 4]]],
  ['美食', [['food photography', 7], ['美食', 7], ['料理', 5], ['dish', 4], ['dessert', 4], ['餐桌', 3], ['烹饪', 3]]],
  ['时尚', [['fashion', 7], ['时尚', 7], ['editorial', 4], ['couture', 5], ['runway', 5], ['lookbook', 5], ['服装', 4], ['穿搭', 4], ['swimsuit', 3]]],
  ['静物', [['product photography', 7], ['产品摄影', 7], ['packaging', 5], ['包装', 5], ['still life', 5], ['静物', 5], ['bottle', 4], ['物品', 3]]],
  ['角色', [['character design', 7], ['角色设计', 7], ['character sheet', 6], ['角色', 5], ['anime character', 5], ['游戏角色', 5]]],
  ['人像', [['portrait', 7], ['人像', 7], ['headshot', 5], ['肖像', 5], ['face close-up', 5], ['面部特写', 5], ['full-body woman', 3], ['人物摄影', 4]]],
  ['抽象', [['abstract', 7], ['抽象', 7], ['surreal', 5], ['超现实', 5], ['geometric', 4], ['几何', 4], ['concept art', 3]]]
];

function searchableText(item) {
  return [item.title, item.prompt, ...(Array.isArray(item.tags) ? item.tags : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function classifyCollection(item = {}) {
  if (item.mediaType === 'video') return VIDEO_CATEGORY;
  const text = searchableText(item);
  let best = '抽象';
  let bestScore = 0;
  for (const [category, terms] of CATEGORY_RULES) {
    const score = terms.reduce((total, [term, weight]) => total + (text.includes(term) ? weight : 0), 0);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function shouldReclassify(item = {}) {
  return item.mediaType === 'video'
    || item.source === 'Grok X 公开搜索'
    || !CATEGORY_RULES.some(([category]) => category === item.category);
}

function reclassifyCollections(payload) {
  let changed = 0;
  const collections = (payload.collections || []).map(item => {
    if (!shouldReclassify(item)) return item;
    const category = classifyCollection(item);
    if (category === item.category) return item;
    changed += 1;
    return { ...item, category };
  });
  return { payload: { ...payload, collections }, changed };
}

module.exports = { VIDEO_CATEGORY, classifyCollection, reclassifyCollections };
