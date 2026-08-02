(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PromptHubExploreFacets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function searchableText(item = {}) {
    return [
      item.title,
      item.category,
      item.commerceType,
      ...(Array.isArray(item.tags) ? item.tags : []),
      item.prompt
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function matches(item, pattern) {
    return pattern.test(searchableText(item));
  }

  const CONTENT_TYPES = [
    { id: 'ui', label: '界面与屏幕', test: item => matches(item, /\bui\b|interface|dashboard|app icon|app ui|网页界面|应用界面|手机界面|界面设计|ui & interfaces|screen mockup/) },
    { id: 'infographic', label: '图表与信息图', test: item => matches(item, /infographic|information graphic|chart|diagram|timeline|地图|图表|信息图|知识图谱|charts & infographics/) },
    { id: 'poster', label: '海报与排版', test: item => matches(item, /poster|typography|cover design|海报|版式|排版|posters & typography/) },
    { id: 'commerce', label: '产品与电商', test: item => item.category === '电商视觉' || matches(item, /product shot|packshot|ecommerce|电商|商品主图|产品摄影/) },
    { id: 'brand', label: '品牌与标志', test: item => item.commerceType === '品牌视觉' || matches(item, /brand identity|visual identity|logo design|brand campaign|品牌视觉|视觉识别|标志设计|brand & logos/) },
    { id: 'architecture', label: '建筑与空间', test: item => item.category === '建筑' || matches(item, /architecture|interior design|建筑|室内设计|建筑空间|architecture & spaces/) },
    { id: 'photography', label: '摄影与写实', test: item => matches(item, /photography|photorealistic|realistic|camera|lens|摄影|写实|超写实|photography & realism/) },
    { id: 'illustration', label: '插画与艺术', test: item => matches(item, /illustration|watercolor|digital art|sketch|插画|水彩|手绘|illustration & art/) },
    { id: 'people', label: '人物与角色', test: item => item.category === '人像' || item.category === '角色' || matches(item, /portrait|character design|人像|人物|角色|characters & people/) },
    { id: 'story', label: '场景与叙事', test: item => matches(item, /storyboard|worldbuilding|narrative|storytelling|分镜|叙事|场景与叙事|scenes & storytelling/) },
    { id: 'history', label: '历史与古典', test: item => matches(item, /historical|classical|traditional chinese|history|古典|历史|国风|古风|history & classical themes/) },
    { id: 'document', label: '文档与出版', test: item => matches(item, /white paper|document|manual|encyclopedia|出版|文档|百科|documents & publishing/) },
    { id: 'other', label: '其他应用', test: item => matches(item, /other use cases|其他创意|workflow|工作流/) }
  ];

  const STYLES = [
    { id: '3d', label: '3D', test: item => matches(item, /\b3d\b|c4d|blender|octane|unreal engine|三维/) },
    { id: 'realistic', label: '写实', test: item => matches(item, /photorealistic|hyperrealistic|realistic|写实|超写实/) },
    { id: 'photography', label: '摄影', test: item => matches(item, /photography|camera|lens|film grain|ccd|摄影|写真|胶片/) },
    { id: 'illustration', label: '插画', test: item => matches(item, /illustration|watercolor|drawing|sketch|插画|水彩|手绘/) },
    { id: 'brand', label: '品牌', test: item => matches(item, /brand identity|visual identity|logo|品牌|标志|视觉识别/) },
    { id: 'minimal', label: '极简', test: item => matches(item, /minimalist|minimalism|极简|留白/) },
    { id: 'classical', label: '古典', test: item => matches(item, /classical|traditional|古典|国风|古风/) },
    { id: 'retro', label: '复古', test: item => matches(item, /retro|vintage|old film|复古|胶片感/) },
    { id: 'future', label: '未来', test: item => matches(item, /futuristic|sci-fi|cyberpunk|未来|科幻|赛博朋克/) },
    { id: 'editorial', label: '编辑感', test: item => matches(item, /editorial|magazine|lookbook|杂志|编辑写真/) }
  ];

  const SCENES = [
    { id: 'commerce', label: '商业', test: item => matches(item, /commercial|campaign|advertis|marketing|商业|营销|品牌活动/) },
    { id: 'ecommerce', label: '电商', test: item => item.category === '电商视觉' || matches(item, /ecommerce|product detail page|商品主图|详情页|电商/) },
    { id: 'education', label: '教育', test: item => matches(item, /education|teaching|encyclopedia|instruction|教育|科普|教程/) },
    { id: 'fashion', label: '时尚', test: item => item.category === '时尚' || matches(item, /fashion|couture|runway|时尚|服装|穿搭/) },
    { id: 'food', label: '美食', test: item => item.category === '美食' || matches(item, /food|cuisine|restaurant|美食|料理|餐厅/) },
    { id: 'travel', label: '旅行', test: item => matches(item, /travel|tourism|destination|旅行|旅游|城市漫游/) },
    { id: 'tech', label: '科技', test: item => matches(item, /technology|tech|futuristic|robot|科技|未来|机器人/) },
    { id: 'social', label: '社媒', test: item => matches(item, /social media|instagram|tiktok|xiaohongshu|小红书|社交媒体/) },
    { id: 'story', label: '故事', test: item => matches(item, /storyboard|narrative|story|分镜|叙事|故事/) },
    { id: 'history', label: '历史', test: item => matches(item, /historical|history|古代|历史|朝代/) },
    { id: 'lifestyle', label: '生活方式', test: item => matches(item, /lifestyle|home|daily life|生活方式|家居|日常/) }
  ];

  const GROUPS = {
    contentType: CONTENT_TYPES,
    style: STYLES,
    scene: SCENES
  };

  function matchesFacet(item, group, id) {
    if (!id || id === 'All') return true;
    const definition = GROUPS[group]?.find(entry => entry.id === id);
    return Boolean(definition?.test(item));
  }

  return { CONTENT_TYPES, STYLES, SCENES, matchesFacet, searchableText };
});
