// Shared PromptHub parser for the website and browser extension.
(function (root, factory) {
  const api = factory();
  root.PromptHubParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TITLE = '未命名提示词';
  const MAX_AUTO_TITLE_LENGTH = 20;

  const PROMPT_LABELS = [
    'prompt', 'full prompt', 'complete prompt', 'positive prompt',
    '提示词', '完整提示词', '正向提示词', '正面提示词', '生成提示词'
  ];

  const HARD_STOP_LABELS = [
    'result image', 'reference images', 'reference image', 'images', 'image',
    'model', 'aspect ratio', 'category', 'tags', 'source', 'try', 'copy',
    '结果图', '结果图片', '参考图', '参考图片', '模型', '宽高比', '分类', '标签',
    '来源', '打开来源', '收藏日期', '热度'
  ];

  const NOISE_PATTERNS = [
    /^(result image|reference images?|explore all prompts|copy prompt|copy|try|open source)$/i,
    /^(prompt hub|prompthub|banana prompts)$/i,
    /^(一键复制提示词|复制提示词|删除收藏|编辑内容|收藏|已收藏|打开来源|去生成)$/i,
    /^(分类|宽高比|模型|收藏日期|热度|标签筛选|相关提示词)$/i,
    /^https?:\/\/\S+$/i,
    /^\d+\s*(人喜欢|likes?)$/i,
    /^\d{4}-\d{2}-\d{2}$/
  ];

  const PROMPT_INDICATORS = [
    'prompt', 'negative prompt', 'positive prompt', 'midjourney', 'stable diffusion',
    'dall-e', 'photorealistic', 'cinematic', '8k', '4k', 'ultra detailed',
    'hyperrealistic', 'masterpiece', 'best quality', 'highly detailed',
    'portrait', 'landscape', 'concept art', 'digital art', 'oil painting',
    'watercolor', 'studio lighting', 'golden hour', 'depth of field', 'bokeh',
    'shot on', '35mm', '50mm', '85mm', 'wide angle', 'close up', 'full body',
    '--ar', '--v', '--style', '--chaos', '--stylize', '--niji',
    '提示词', '正向提示', '正面提示', '负面提示', '反向提示', '生成', '构图',
    '光照', '光线', '背景', '前景', '画质', '高清', '写实', '电影感',
    '风格', '质感', '细节', '氛围', '镜头', '焦距', '景深', '参考上传',
    '不要文字', '不要水印', '人物', '服装', '姿态', '环境'
  ];

  const TITLE_NOISE_PATTERNS = [
    /^(?:made\s+with\s+)?gpt\s*image\s*\d+(?:\s+(?:on|via)\s+chatgpt)?(?:\s*(?:prompt|提示词?))?$/i,
    /^by\s+(?:gemini\s+)?nano\s+banana$/i,
    /^(?:gemini\s+)?nano\s+banana(?:\s+(?:prompt|images?))?$/i,
    /^(?:today'?s\s+)?portrait\.?$/i,
    /^(?:image|video)\s*prompt$/i,
    /^主页\s*\/\s*x$/i,
    /^x\s+上的/i,
    /^(?:这组图|兄弟们|姐妹们|今天|今晚|最近发现|跟大家分享|整理一下|非常实用|想申请|餐饮老板|我通过|本来以为|特别想分享|续集来了|有时候会觉得|一开始人们还不知道|再次惊叹|神仙提示词|生产力|be careful|compliment her outfit|meet agent|images created|no crew)/i
  ];

  const COMPACT_TITLE_RULES = [
    { title: '商品视频', pattern: /(product video|ecommerce video|商品视频|电商视频|短视频广告)/i },
    { title: '产品广告', pattern: /(commercial|skincare|cosmetic|cream jar|packaging|takeaway packaging|产品广告|商业广告|护肤品|化妆品|包装设计|外卖包装)/i },
    { title: '品牌视觉', pattern: /(logo|brand identity|visual identity|brand campaign|livery|vi proposal|品牌视觉|品牌识别|视觉识别|标志设计|logo提案|品牌广告)/i },
    { title: '产品主图', pattern: /(product hero|product shot|packshot|white background|产品主图|白底图|商品主图)/i },
    { title: '电商海报', pattern: /(product ad|advertising poster|poster|广告海报|商品广告|营销海报)/i },
    { title: '口播视频', pattern: /(dialogue|speaks|voiceover|口播|旁白|台词|双语视频)/i },
    { title: '电影短片', pattern: /(15-second|cinematic scene|video prompt|camera movement|电影短片|分镜|镜头运动)/i },
    { title: '机场人像', pattern: /(airport|候机|登机|机场)/i },
    { title: '韩系人像', pattern: /(korean|韩国|韩系|韩风)/i },
    { title: '东方人像', pattern: /(east asian|oriental|chinese|japanese|asian woman|东亚|东方|中式|日系|和风)/i },
    { title: '工具流程', pattern: /(codex|skill|agent|obsidian|github|claude code|workflow|专利|知识库|工作流|流程图|技能|自动扫描|开源地址)/i },
    { title: '时尚人像', pattern: /(fashion|editorial|couture|runway|outfit|clothing|attire|时尚|高定|穿搭|大片|穿著|针织|針織|牛仔|妝容|妆容|连衣裙|背心)/i },
    { title: '运动人像', pattern: /(yoga|fitness|sportswear|运动|瑜伽|健身)/i },
    { title: '家居人像', pattern: /(bedroom|living room|home|sofa|室内|卧室|客厅|家居)/i },
    { title: '海边人像', pattern: /(beach|sea|ocean|mediterranean|shoreline|海边|海岸|海洋)/i },
    { title: '街头人像', pattern: /(street|city|urban|街头|城市|街拍)/i },
    { title: '写真人像', pattern: /(portrait|woman|girl|man|person|model|人物|人像|女性|男性|模特|写真)/i },
    { title: '建筑空间', pattern: /(architecture|interior|room|house|building|treehouse|建筑|室内|空间|树屋)/i },
    { title: '奇幻角色', pattern: /(fantasy|dragon|magic|character|creature|角色|奇幻|魔法)/i },
    { title: '科幻场景', pattern: /(sci-fi|cyberpunk|futuristic|space|robot|科幻|赛博|未来)/i },
    { title: '自然风景', pattern: /(landscape|mountain|forest|lake|sunset|sunrise|风景|山脉|森林|日出|日落)/i },
    { title: '抽象视觉', pattern: /(abstract|surreal|concept art|抽象|超现实|概念)/i }
  ];

  const BROAD_AUTO_TITLE_SET = new Set(COMPACT_TITLE_RULES.map(rule => rule.title));

  const SPECIFIC_TITLE_RULES = [
    { title: '春日花丛海边人像', pattern: /(花丛|天台|街角|海边的白色栏杆)[\s\S]{0,220}(春天|暂停键|发呆)/i },
    { title: '极简椅边棚拍人像', pattern: /studio_fashion_portrait[\s\S]{0,220}(minimalist_editorial|chair_on_right|one_leg_raised)/i },
    { title: '石墙长椅针织牛仔人像', pattern: /(石頭牆|石头墙|stone wall)[\s\S]{0,180}(白色低領背心|针织|針織|牛仔短褲|denim shorts?)/i },
    { title: 'Obsidian记忆技巧', pattern: /(Obsidian|知识库)[\s\S]{0,180}(记忆|AGENTS\.md|全局规则)/i },
    { title: '内衣品牌KV海报', pattern: /(品牌KV海报|KV设计)[\s\S]{0,120}(内衣品牌|Victoria|Shirley)/i },
    { title: '小吃品牌视觉提案', pattern: /(小吃也有品牌感|地方小吃|品牌视觉提案)[\s\S]{0,180}(品牌主视觉|包装应用|传播)/i },
    { title: '图形化Logo设计', pattern: /(图形化LOGO|logo设计|字母和图形)[\s\S]{0,180}(草图|颜色规范|样机)/i },
    { title: '卧室三连自拍', pattern: /(three selfies|personality arc|Warm bedroom light|messy hair)/i },
    { title: '闲鱼自动化管家', pattern: /(xianyu-super-butler|闲鱼超级管家|闲鱼神器|自动化工具)/i },
    { title: 'Codex额度记忆技巧', pattern: /(Codex实用小技巧|额度管理|记忆功能|Goal 模式)/i },
    { title: '螺蛳粉品牌提案', pattern: /(螺蛳粉品牌|嗦粉局|SLURP CLUB|夜宵品牌)/i },
    { title: '纽约天际酒店床边人像', pattern: /(floor-to-ceiling glass wall|New York skyline|soft white hotel bed|bar stool)/i },
    { title: '单眼发丝特写', pattern: /(only one eye visible|peeking through long|wavy hair|one eye)/i },
    { title: '现代卧室镜自拍', pattern: /(mirror selfie|full-length mirror|modern bedroom|卧室镜自拍)/i },
    { title: '调皮表情美妆人像', pattern: /(tongue slightly out|playful expression|bright expressive eyes|glossy lips)/i },
    { title: '沙漠黑马斗篷人像', pattern: /(black horse|desert landscape|medieval-inspired cloak|majestic)/i },
    { title: '夜楼风吹街拍', pattern: /(building at night|hair blowing in the wind|low-angle camera|dark negative space)/i },
    { title: '黄丝衬衫三联肖像', pattern: /(three photorealistic studio portraits|yellow silk blouse|three-quarter profile)/i },
    { title: '花阴咖啡街角人像', pattern: /(花陰のコーヒー|紙カップ|オレンジ色の花|街角)/i },
    { title: '大教堂夜景九人群像', pattern: /(nine young Asian women|Piazza del Duomo|cathedral at night)/i },
    { title: '浅色室内真丝长袍', pattern: /(浅色室内空间|真丝长袍|淡燕麦色|领口自然滑落)/i },
    { title: 'Y2K朋克吊带短裤', pattern: /(Y2K punk camisole|gray sheer layered|distressed black denim micro shorts)/i },
    { title: '酒店卧室浴巾人像', pattern: /(modern hotel bedroom|terry-cloth towel|strapless like a mini dress)/i },
    { title: '建材角落躺姿人像', pattern: /(construction-material corner|stacked boards|cement bags|lying pose)/i },
    { title: 'Soho街角蹲姿人像', pattern: /(Soho street corner|pub frontage reflections|squatting pose)/i },
    { title: '大教堂阳光四人街拍', pattern: /(four young Japanese women|Piazza del Duomo at midday|shopping bags)/i },
    { title: '城市高跟鞋街拍', pattern: /(urban shots|Silver straps|burgundy pumps|nude slingbacks|long legs)/i },
    { title: '酒红天鹅绒礼服', pattern: /(deep burgundy velvet maxi gown|palace-style interior|ornate gold mirrors)/i },
    { title: '南亚黑衬衫街拍', pattern: /(South Asian woman|oversized black button-down shirt|rock on hand gesture)/i },
    { title: '城市巨影男装人像', pattern: /(young man|modern minimalist urban environment|massive shadow|black t-shirt)/i },
    { title: '紫色棚拍美发人像', pattern: /(lavender|purple seamless studio backdrop|running through her long.*hair)/i },
    { title: '飞行员眼镜男装人像', pattern: /(modern textured quiff|aviator eyeglasses|luxury editorial fashion)/i },
    { title: '花园金色时光人像', pattern: /(Relaxing in the Garden|lush garden during golden hour|peaceful smile)/i },
    { title: '千禧直闪室内人像', pattern: /(early-2000s compact digital camera|direct on-camera flash|low-resolution nostalgic)/i },
    { title: '低髻冷感日系人像', pattern: /(eyes with slight redness|crying or cold air|loose low bun)/i },
    { title: '复古电脑卧室人像', pattern: /(retro computer workstation|cozy apartment bedroom|glancing back)/i },
    { title: '东京公寓浴室人像', pattern: /(Tokyo apartment bathroom|direct on-camera flash|late-night lifestyle photobook)/i },
    { title: 'CEO感高定街拍', pattern: /(CEO-like presence|walking confidently toward the camera|luxury fashion editorial)/i },
    { title: '海滨长廊金色人像', pattern: /(beachfront promenade|golden hour|chestnut-brown hair)/i },
    { title: '门口撸猫生活人像', pattern: /(doorway of a modern home|petting a gray-and-white tabby cat)/i },
    { title: '酒店房间眼镜人像', pattern: /(boutique hotel room|thin-frame glasses|warm night ambience)/i },
    { title: '直闪闺房写真', pattern: /(private boudoir|harsh direct on-camera flash|Y2K retro)/i },
    { title: '深夜书桌背心人像', pattern: /(late-night study room|wooden desk|white ribbed tank top)/i },
    { title: '床边低机位韩系人像', pattern: /(low-angle camera perspective|soft bed|Korean beauty editorial)/i },
    { title: '浅蓝蕾丝礼服人像', pattern: /(light blue ballgown|lace detailing|floor-length)/i },
    { title: '炭灰棚拍缎面吊带', pattern: /(charcoal-gray backdrop|olive satin camisole|minimalist photography studio)/i },
    { title: '沙漠金色泳装人像', pattern: /(amber swimsuit|gold silk wrap|desert dunes)/i },
    { title: '热带城市泳装回眸', pattern: /(热带城市环境|回眸姿态|露背泳装|钩针镂空)/i },
    { title: '厨房炉灶白衬衫人像', pattern: /(whisking eggs|stovetop|oversized white cotton shirt)/i },
    { title: '公寓厨房双人泳装', pattern: /(公寓厨房|kitchen)[\s\S]{0,160}(两位|双人|couple|two)[\s\S]{0,160}(泳衣|泳装|比基尼|swimwear|bikini)/i },
    { title: '中式老宅扶手椅人像', pattern: /(中式老宅|老宅)[\s\S]{0,120}(扶手椅|雕花木椅|chair)/i },
    { title: '白棚方台蹲坐人像', pattern: /(白色无缝摄影棚|无缝摄影棚|white seamless studio)[\s\S]{0,140}(蹲坐|方台|squatting|geometric block)/i },
    { title: '户外民族舞人像', pattern: /(户外|outdoor)[\s\S]{0,100}(民族舞|舞蹈|dance)/i },
    { title: '机场候机人像', pattern: /(机场候机大厅|现代机场|airport|boarding pass|luggage)/i },
    { title: '宋式美学海报', pattern: /(宋式美学|宋制|song dynasty|宋代)/i },
    { title: '粉彩咖啡馆情侣', pattern: /(粉彩咖啡馆|pastel café|pastel cafe)[\s\S]{0,120}(couple|情侣|夫妻|穆斯林)/i },
    { title: '湖边日落情侣肖像', pattern: /(湖边|lake)[\s\S]{0,120}(sunset|日落|情侣|couple)/i },
    { title: '帆船甲板阳光人像', pattern: /(帆船甲板|sailing ship|sailboat|deck)[\s\S]{0,160}(portrait|woman|人像|女性)/i },
    { title: '副驾驶自拍人像', pattern: /(副驾驶|passenger seat|car selfie|汽车)[\s\S]{0,140}(自拍|selfie)/i },
    { title: '日式厨房人像', pattern: /(日式厨房|Japanese kitchen|kitchen)[\s\S]{0,120}(portrait|woman|人像|女性)/i },
    { title: '清晨卧室窗边人像', pattern: /(清晨卧室|bedroom|white bed)[\s\S]{0,160}(窗边|window|morning)/i },
    { title: '酒店房间皮革束腰', pattern: /(酒店房间|hotel room)[\s\S]{0,160}(皮革|corset|束腰)/i },
    { title: '霓虹夜街蓝眸人像', pattern: /(霓虹夜街|neon lights|city street at night)[\s\S]{0,160}(blue eyes|蓝眸|蓝眼)/i },
    { title: '赛博机械女性人像', pattern: /(赛博朋克|cyberpunk)[\s\S]{0,160}(机械|biomechanical|cybernetic)/i },
    { title: '古风书案坐姿人像', pattern: /(书案|tea room|茶室|古风)[\s\S]{0,140}(坐姿|坐在|seated)/i },
    { title: '团扇遮面东方人像', pattern: /(团扇|fan)[\s\S]{0,120}(遮面|covering face|东方|oriental)/i },
    { title: '森林光影东方肖像', pattern: /(森林|forest)[\s\S]{0,160}(东方|oriental|肖像|portrait)/i },
    { title: '光影古风特写人像', pattern: /(古风|汉服|hanfu)[\s\S]{0,160}(特写|close-up|光影)/i },
    { title: '灰绿瞳美妆特写', pattern: /(gray-green eyes|灰绿瞳|crystal gray-green)[\s\S]{0,120}(beauty|美妆|close-up|特写)/i },
    { title: '米色针织情绪肖像', pattern: /(米色针织|knit|针织)[\s\S]{0,120}(moody|情绪|肖像|portrait)/i },
    { title: '涂鸦墙街头人像', pattern: /(graffiti|涂鸦墙|street art)[\s\S]{0,120}(street|街头|portrait|人像)/i },
    { title: '网球场运动海报', pattern: /(球场|tennis|网球)[\s\S]{0,160}(运动|sport|海报|poster)/i },
    { title: '赛车品牌涂装', pattern: /(formula 1|race car|livery|motorsport|赛车|涂装)[\s\S]{0,160}(logo|brand|品牌|视觉)/i },
    { title: '豪华钢笔概念板', pattern: /(pen concept|premium pen|luxury stationery|钢笔|文具)[\s\S]{0,160}(concept|presentation|概念|展示)/i },
    { title: '护肤品商业短片', pattern: /(skincare commercial|cosmetic cream jar|护肤品|化妆品)[\s\S]{0,160}(commercial|广告|短片|video)/i },
    { title: '外卖包装设计', pattern: /(外卖包装|takeaway packaging|food packaging|餐饮包装)/i },
    { title: '外带包装样机提案', pattern: /(外带包装样机|外带包装|包装样机|实物 mockup)[\s\S]{0,220}(提案|品牌包装|设计稿|落地效果)/i },
    { title: '原创IP商品提案', pattern: /(原创\s*IP|IP 商品化|productization|商品化提案)/i },
    { title: '海盗冒险短片', pattern: /(pirate|海盗)[\s\S]{0,180}(dialogue|shoreline|cave|短片|冒险)/i },
    { title: '双语口播视频', pattern: /(双语视频|bilingual video|口播|voiceover|TikTok|YouTube)/i },
    { title: '手绘讲解视频', pattern: /(手绘|whiteboard|explanation video|讲解视频)/i },
    { title: '图像改写系统提示词', pattern: /(SYSTEM PROMPT|系统提示词)[\s\S]{0,120}(ANCHOR BLOOM|Rewrite the user's text|改写)/i },
    { title: 'Codex技能工作流', pattern: /(codex)[\s\S]{0,160}(skill|技能|workflow|工作流)/i },
    { title: '专利交底书技能', pattern: /(专利|patent)[\s\S]{0,160}(交底书|skill|技能|流程图)/i },
    { title: '胎儿四维照片还原', pattern: /(胎儿四维|四维照片|fetal ultrasound)/i }
  ];

  const TITLE_SCENE_TERMS = [
    ['公寓厨房', /(公寓厨房|apartment kitchen|modern kitchen|厨房台面)/i],
    ['黑色摄影棚', /(纯黑色摄影棚|黑色摄影棚|black studio background|black backdrop)/i],
    ['白色摄影棚', /(白色无缝摄影棚|无缝摄影棚|white seamless studio|neutral white backdrops?|white backdrops?|白色背景)/i],
    ['暖白摄影棚', /(暖白色摄影棚|warm beige wall|warm white studio|暖白色背景)/i],
    ['酒店走廊', /(酒店走廊|电梯间|hotel corridor|elevator hall)/i],
    ['酒店阳台', /(hotel balcony|river-view terrace|酒店阳台|河景露台)/i],
    ['寺街食肆', /(temple street eatery|sidewalk table|plastic stools|寺街|食肆|路边餐桌)/i],
    ['九龙城寨', /(kowloon walled city|九龙城寨)/i],
    ['通勤列车', /(commuter train|train car|列车车厢|通勤列车)/i],
    ['独立书店', /(independent bookstore|bookstore|书店)/i],
    ['海边晨光', /(seaside|white sand beach|ocean bokeh|海边|海岸|沙滩|海雾)/i],
    ['雅典卫城', /(acropolis|雅典卫城)/i],
    ['现代办公室', /(modern office|办公室|office)/i],
    ['小区楼道', /(小区楼道|单元楼门口|快递堆|取件码)/i],
    ['洗衣篮旁', /(laundry basket|洗衣篮)/i],
    ['居酒屋', /(izakaya|居酒屋|world cup match)/i],
    ['奢华酒廊', /(luxury modern lounge|cocktail event|奢华酒廊|鸡尾酒会)/i],
    ['石墙长椅', /(stone wall|modern bench|石头墙|现代长椅)/i],
    ['日式卧室', /(Japanese-style bedroom|white bed|日式卧室|白色床)/i],
    ['夜晚窗边', /(夜晚室内窗边|窗边场景|night.*window)/i],
    ['和室障子', /(障子|和風|和风室内|shoji)/i],
    ['餐厅卡座', /(餐桌另一侧|卡座|restaurant booth|dining table)/i],
    ['私人影棚', /(private studio set|minimalist private studio|私人摄影棚|私密影棚)/i],
    ['艺术画廊', /(art gallery|typography posters|艺术画廊|画廊)/i],
    ['室内泳池', /(indoor pool|室内泳池|泳池)/i],
    ['草原蓝天', /(草原|初夏|blue sky|meadow|積雲|青空)/i],
    ['咖啡馆夜景', /(咖啡馆暖金灯|café|cafe|nightlife|夜间生活)/i],
    ['窗边婚纱', /(婚纱照|婚纱)[\s\S]{0,160}(头纱|窗边|新娘|wedding veil)/i],
    ['天鹅绒沙发', /(velvet sofa|luxurious sofa|天鹅绒沙发|丝绒沙发)/i],
    ['外带包装样机', /(外带包装样机|外带包装|包装样机|mockup|实物 mockup)/i],
    ['宋式留白', /(宋式|宋代|茶饮|香文化|文创展|新中式)/i],
    ['香氛品牌', /(SCENT ROOM|闻间|香香云|香型标签|香氛|选香)/i],
    ['地下停车场', /(underground parking garage|parking garage|地下停车场|停车场)/i],
    ['旗袍唱片', /(cheongsam|旗袍)[\s\S]{0,160}(vinyl records?|唱片)/i],
    ['硬科幻沙漠', /(Hard Sci-Fi|desert sequence|desert planet|沙漠星球|硬科幻)/i],
    ['玩偶棚拍', /(plush teddy bear|teddy bear|玩偶|泰迪熊)[\s\S]{0,160}(studio|棚拍|portrait)/i],
    ['温室晨光', /(greenhouse|温室|玻璃花房)/i],
    ['古风设定图', /(古风|汉服|国风|cosplay|服饰拆解|exploded view)/i],
    ['个人宣传海报', /(教练宣传海报|个人形象商业|中文教练|coach poster)/i],
    ['换装对比海报', /(换装|试穿|try[-\s]?on|outfit comparison|outfit change|character[\s\S]{0,120}result|四格式|服装套组|穿搭平铺)/i],
    ['树屋概念', /(treehouse|树屋|luxury treehouse)/i],
    ['赛车涂装', /(formula 1|race car|livery|motorsport|赛车|涂装)/i],
    ['护肤品广告', /(skincare commercial|cosmetic cream jar|护肤品|化妆品|cream jar)/i],
    ['包装设计', /(takeaway packaging|food packaging|外卖包装|餐饮包装)/i],
    ['公园长椅', /(park bench|公园长椅)/i],
    ['公园路牌', /(directional signpost|路牌|指示牌|lush green park)/i],
    ['湖边日落', /(lake|sunset|湖边|日落)/i],
    ['帆船甲板', /(sailing ship|sailboat|deck|帆船|甲板)/i],
    ['霓虹夜街', /(neon|city street at night|霓虹|夜街)/i],
    ['赛博朋克', /(cyberpunk|赛博朋克)/i],
    ['茶室书案', /(tea room|书案|茶室)/i],
    ['森林光影', /(forest|森林)/i],
    ['街头涂鸦', /(graffiti|street art|涂鸦|街头)/i],
    ['机场候机', /(airport|boarding pass|luggage|机场|候机|登机牌)/i]
  ];

  const TITLE_DETAIL_TERMS = [
    ['双人泳装', /(两位|双人|two|couple)[\s\S]{0,140}(泳衣|泳装|比基尼|swimwear|bikini)/i],
    ['直闪吊带', /(direct flash|直闪)[\s\S]{0,160}(吊带|silk dress|hotel corridor)/i],
    ['美容广告', /(beauty advertising|high-end beauty|美容广告|美妆广告|精致妆容)/i],
    ['头纱婚纱照', /(婚纱照|婚纱|wedding dress|wedding portrait)[\s\S]{0,160}(头纱|新娘|veil)/i],
    ['缎面开衩裙', /(black high-slit satin dress|satin dress|缎面裙|开衩裙)/i],
    ['宋式茶饮KV', /(宋式|宋代|新中式)[\s\S]{0,200}(茶饮|香文化|文创展|KV)/i],
    ['外带包装提案', /(外带包装|包装样机|mockup|实物 mockup)[\s\S]{0,200}(提案|品牌包装|设计稿)/i],
    ['香氛品牌提案', /(SCENT ROOM|闻间|香香云|香氛|香型标签)[\s\S]{0,220}(品牌系统|包装|详情页)/i],
    ['三点式泳装提案', /(三点式泳装|泳装提案|度假神装)/i],
    ['丝袜详情页', /(丝袜电商详情页|丝袜|stockings)[\s\S]{0,160}(详情页|上架|电商)/i],
    ['浴衣', /(yukata|浴衣)/i],
    ['牛仔短裙', /(denim stretch|牛仔短裙|牛仔短裤|denim shorts?)/i],
    ['蕾丝长袍', /(lace robe|蕾丝长袍|蕾丝睡袍)/i],
    ['晚礼服', /(evening gown|mermaid gown|floor-length skirt|晚礼服|礼服|高定)/i],
    ['亚麻衬衫', /(linen shirt|亚麻衬衫|象牙白亚麻)/i],
    ['黑色吊带裙', /(黑色丝质吊带裙|皮质吊带背心|吊带裙)/i],
    ['黑色西装', /(black blazer|black shirt|black trousers|黑色西装|黑色西服)/i],
    ['针织牛仔短裤', /(白色低領背心|白色低领背心|針織開襟背心|针织开襟背心|denim shorts?|牛仔短褲|牛仔短裤)/i],
    ['针织背心', /(knit|针织|針織)/i],
    ['古风丝袜', /(古风[\s\S]{0,80}丝袜|丝袜[\s\S]{0,80}古风|stockings)/i],
    ['换装试穿', /(换装|试穿|try[-\s]?on|outfit comparison|outfit change|服装套组|穿搭平铺)/i],
    ['教练宣传', /(教练宣传|coach poster|个人形象商业)/i],
    ['甜辣棚拍', /(甜辣酷飒|高阶辣妹|酷飒棚拍|攻击性)/i],
    ['猫咪合照', /(狸花猫|猫咪|cat)[\s\S]{0,160}(同框|合照|自拍)/i],
    ['室内亲密合照', /(坐在男生的腿上|搂住女生|亲密|随性)[\s\S]{0,160}(室内|腰|互动)/i],
    ['水彩阅读插画', /(watercolor|水彩)[\s\S]{0,180}(reading a book|open journal|读书|笔记)/i],
    ['草原动漫截图', /(anime screenshot|セルシェーディング|动漫截图|日傘|阳伞)/i],
    ['餐桌亲密互动', /(双脚|脚部|餐桌|卡座)[\s\S]{0,180}(搭在|互动|亲近)/i],
    ['墨金CCD滤镜', /(黑珍珠墨金|dark gold CCD|墨金CCD|闪光灯滤镜)/i],
    ['混媒文字肖像', /(mixed-media|ink sketch|cryptic handwritten text|手写文字|混媒)/i],
    ['植物藤蔓肖像', /(green vines|botanical stems|clovers|植物藤蔓|藤蔓)/i],
    ['室内泳装海报', /(indoor pool|室内泳池)[\s\S]{0,180}(swimsuit|泳装|poster|海报)/i],
    ['人格档案海报', /(人格|人物档案海报|主题对象|人格命题)/i],
    ['公园路牌街拍', /(directional signpost|路牌|指示牌)[\s\S]{0,160}(park|公园|street)/i],
    ['瑜伽裤取快递', /(取快递|快递堆|瑜伽裤|取件码)/i],
    ['和室亚麻逆光', /(障子|shoji)[\s\S]{0,180}(linen|リネン|亚麻|逆光)/i],
    ['酒红棒球帽街拍', /(burgundy baseball cap|棒球帽|streetwear)[\s\S]{0,160}(parking|停车场|streetwear)/i],
    ['旗袍唱片写真', /(cheongsam|旗袍)[\s\S]{0,160}(vinyl records?|唱片|editorial)/i],
    ['硬科幻沙漠分镜', /(Hard Sci-Fi|desert sequence|stillsuit|沙漠)[\s\S]{0,160}(storyboard|sequence|分镜)/i],
    ['泰迪熊棚拍人像', /(plush teddy bear|teddy bear|泰迪熊|玩偶)[\s\S]{0,160}(studio|portrait|棚拍)/i],
    ['赛车品牌', /(logo|brand|品牌|visual identity|视觉识别)[\s\S]{0,160}(race car|赛车|涂装|livery)/i],
    ['角色树屋', /(character-reference|character reference|角色参考|角色)[\s\S]{0,160}(treehouse|树屋)/i],
    ['护肤商业', /(skincare|cosmetic|护肤|化妆品)[\s\S]{0,160}(commercial|广告|短片|video)/i],
    ['外卖包装', /(外卖包装|takeaway packaging|餐饮包装)/i],
    ['情侣肖像', /(couple|couples|情侣|夫妻)/i],
    ['运动海报', /(tennis|sportswear|运动|网球|球场)/i],
    ['电影感', /(cinematic|电影感)/i],
    ['编辑写真', /(editorial|fashion editorial|杂志|大片|写真)/i],
    ['口播视频', /(voiceover|dialogue|speaks|口播|旁白|台词)/i],
    ['视频短片', /(video prompt|camera movement|8-second|15-second|短片|视频|镜头运动)/i]
  ];

  const TITLE_SUBJECT_TERMS = [
    ['宇航员肖像', /(astronaut|宇航员|航天员)/i],
    ['双人肖像', /(couples?|两位|双人|情侣|夫妻)/i],
    ['女性人像', /(woman|girl|female|女性|女人|女孩|人像|肖像|写真|portrait)/i],
    ['人物海报', /(人物照片|个人形象|宣传海报|poster)/i],
    ['产品海报', /(product|产品|商品|packshot|主图|海报|广告)/i],
    ['品牌视觉', /(brand|logo|visual identity|品牌|视觉识别|标志)/i],
    ['视频短片', /(video|短片|视频|镜头|camera movement)/i],
    ['空间概念', /(architecture|interior|space|treehouse|建筑|空间|树屋)/i]
  ];

  // These terms form a descriptive fallback when an imported title is only a
  // broad label such as "时尚人像" or "产品广告".
  const TITLE_CONTEXT_TERMS = [
    ['韩系奶茶灰自拍', /(korean|韩国|韩系)[\s\S]{0,180}(selfie|front phone camera|前置镜头)[\s\S]{0,180}(milk tea gray|奶茶灰)/i],
    ['客机机舱', /(commercial airplane|airplane galley|aircraft cabin|飞机客舱|机舱)/i],
    ['四格肖像', /(panel\s*[1-4]|four[-\s]?panel|four poses|四格|四连肖像)/i],
    ['换装网格', /(fashion grid|different outfits|outfit grid|换装网格|多套穿搭)/i],
    ['电影海报', /(movie poster|film poster|电影海报)/i],
    ['RPG角色界面', /(rpg|role-playing game)[\s\S]{0,180}(status screen|character screen|角色界面|状态界面)/i],
    ['主题乐园', /(theme park|主题乐园)/i],
    ['数位板上色', /(pen tablet|drawing tablet|数位板|手绘板)[\s\S]{0,180}(coloring|上色|line art|线稿)/i],
    ['立方城市微缩景观', /(cube[-\s]?shaped diorama|cube diorama|立方体)[\s\S]{0,180}(city|城市|streets|街道)/i],
    ['抽象表现主义肖像', /(abstract expressionism|抽象表现主义)/i],
    ['原创星座夜空', /(fictional constellations|original constellations|原创星座|虚构星座)/i],
    ['动漫能力变身', /(devil fruit|ability transformation|能力变身)/i],
    ['跑车街头自拍', /(bmw\s*i8|supercar|跑车)[\s\S]{0,180}(selfie|自拍)/i],
    ['窗台阅读', /(窗台|window sill|窗框)[\s\S]{0,220}(阅读|杂志|画册|reading|magazine)/i],
    ['蔷薇花园', /(white roses?|rose garden|白色蔷薇|玫瑰花园)/i],
    ['白色影棚', /(white seamless studio|white studio|白色影棚|白色摄影棚)/i],
    ['城市街头', /(city street|urban street|城市街头|街景)/i]
  ];

  const TITLE_FEATURE_TERMS = [
    ['奶茶灰长发', /(milk tea gray|奶茶灰)[\s\S]{0,120}(long hair|长发)/i],
    ['珠宝', /(diamond necklace|diamond ring|jewelry|jewellery|珠宝|钻石)/i],
    ['红唇', /(red lipstick|红唇|红色口红)/i],
    ['蓝色皮草', /(electric blue faux fur|blue fur coat|蓝色皮草)/i],
    ['粉玫瑰', /(pink roses?|粉色玫瑰|粉玫瑰)/i],
    ['葡萄', /(shine muscat|muscat grapes?|麝香葡萄|葡萄)/i],
    ['汽水', /(golden peach fizz|beverage can|汽水|饮料罐)/i],
    ['手足特写', /(hand and foot close-up|hand[-\s]?foot close-up|手足特写|手脚特写)/i]
  ];

  // Creator/platform labels often precede the real prompt in social posts.
  const PUBLISHER_PREAMBLE_PATTERNS = [
    /^\s*(?:gpt\s*image\s*\d+(?:\s+(?:on|via)\s+chatgpt)?|chatgpt\s*image\s*\d*)\s*(?:\u63d0\u793a\u8bcd?|prompt)\s*[:\uff1a\u2014-]*\s*/i,
    /^\s*(?:gemini\s+)?nano\s+banana(?:\s+images?)?\s+prompt\s*[:\uff1a\u2014-]*\s*/i
  ];

  function cleanText(value) {
    return String(value || '')
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function stripPublisherPreamble(value) {
    let text = cleanText(value);
    for (const pattern of PUBLISHER_PREAMBLE_PATTERNS) {
      text = text.replace(pattern, '');
    }
    return text.trim();
  }

  function extractImageUrls(text) {
    const matches = cleanText(text).match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|avif)(?:\?[^\s"'<>]*)?/gi) || [];
    return [...new Set(matches.map(url => url.replace(/[),.;，。]+$/g, '')))];
  }

  function stripImageUrls(text) {
    return cleanText(text)
      .replace(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|avif)(?:\?[^\s"'<>]*)?/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitLines(text) {
    return cleanText(text).split('\n').map(line => line.trim()).filter(Boolean);
  }

  function normalizeLabel(line) {
    return line
      .replace(/^[-_*#\s]+|[-_*#\s]+$/g, '')
      .replace(/[：:]+$/g, '')
      .trim()
      .toLowerCase();
  }

  function isNoiseLine(line) {
    const value = normalizeLabel(line);
    if (!value) return true;
    if (value.length <= 2 && !/[a-z0-9\u4e00-\u9fff]/i.test(value)) return true;
    return NOISE_PATTERNS.some(pattern => pattern.test(value));
  }

  function isPromptLabel(line) {
    return PROMPT_LABELS.includes(normalizeLabel(line)) ||
      /^(prompt|full prompt|complete prompt|positive prompt|提示词|完整提示词|正向提示词|正面提示词)\s*[:：]/i.test(line);
  }

  function isHardStopLine(line) {
    const value = normalizeLabel(line);
    if (PROMPT_LABELS.includes(value) || value === 'negative prompt' || value === '反向提示词' || value === '负面提示词') {
      return false;
    }
    return HARD_STOP_LABELS.includes(value);
  }

  function stripInlineLabel(line) {
    if (PROMPT_LABELS.includes(normalizeLabel(line))) return '';
    return line.replace(/^(prompt|full prompt|complete prompt|positive prompt|提示词|完整提示词|正向提示词|正面提示词)\s*[:：]\s*/i, '').trim();
  }

  function promptScore(text) {
    const value = cleanText(text);
    const lower = value.toLowerCase();
    let score = 0;
    PROMPT_INDICATORS.forEach(indicator => {
      if (lower.includes(indicator.toLowerCase())) score += 1;
    });
    const commaCount = (value.match(/[,，]/g) || []).length;
    const cnChars = (value.match(/[\u4e00-\u9fff]/g) || []).length;
    const wordCount = value.split(/\s+/).filter(Boolean).length + Math.floor(cnChars / 2);
    if (commaCount >= 4) score += 2;
    if (wordCount >= 35) score += 2;
    if (/\b(--ar|--v|--style|--chaos|--stylize|--niji|seed|cfg|sampler)\b/i.test(value)) score += 3;
    if (/(Core Concept|Subject Reference|Environment and Lighting|Composition|Mood and Atmosphere)/i.test(value)) score += 3;
    if (/(参考上传|不生成任何文字|画面|构图|人物|背景|光线)/.test(value) && cnChars > 60) score += 3;
    return score;
  }

  function looksLikePrompt(text) {
    const value = cleanText(text);
    return value.length >= 40 && promptScore(value) >= 3;
  }

  function isCompletePrompt(text) {
    const value = cleanText(text);
    const score = promptScore(value);
    const commaCount = (value.match(/[,，]/g) || []).length;
    const hasGenerationParams = /\b(--ar|--v|--style|--chaos|--stylize|--niji|seed|cfg|sampler)\b/i.test(value);

    // Short X posts can contain a complete, useful prompt. Accept them only
    // when their structure is strong enough to avoid treating captions as prompts.
    if (value.length < 80 || score < 3) return false;
    if (value.length < 160 && !(score >= 4 && (commaCount >= 3 || hasGenerationParams))) return false;

    // Collapsed social posts commonly end mid-clause. Keep those out of the library.
    return !/(?:[,;:\uFF0C\u3001\uFF1A]|\b(?:and|with|the|a|an|or|of|to|in))$/i.test(value);
  }

  function extractLabeledPrompt(lines) {
    let start = -1;
    let inline = '';
    for (let i = 0; i < lines.length; i++) {
      if (isPromptLabel(lines[i])) {
        start = i;
        inline = stripInlineLabel(lines[i]);
        break;
      }
    }
    if (start === -1) return '';

    const collected = [];
    if (inline && !isNoiseLine(inline)) collected.push(inline);

    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isHardStopLine(line)) break;
      if (isNoiseLine(line)) continue;
      collected.push(line);
    }

    return collected.join('\n\n').trim();
  }

  function isStandaloneTitleLine(line, restText) {
    const value = cleanTitle(line);
    if (value.length < 3 || value.length > 68) return false;
    if (isNoiseLine(value) || isPromptLabel(value)) return false;
    if (titleLooksLikePrompt(value, restText)) return false;
    return promptScore(restText) >= 3 || looksLikePrompt(restText);
  }

  function extractUnlabeledPrompt(lines) {
    let useful = lines.filter(line => !isNoiseLine(line));
    if (!useful.length) return '';

    if (useful.length > 1 && isStandaloneTitleLine(useful[0], useful.slice(1).join('\n'))) {
      useful = useful.slice(1);
    }

    const blocks = [];
    let current = [];
    useful.forEach(line => {
      if (/^(title|标题)\s*[:：]/i.test(line)) return;
      if (line.length <= 64 && current.length && !looksLikePrompt(line)) {
        blocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.length) blocks.push(current.join('\n'));

    const scored = blocks
      .map(block => ({ block: block.trim(), score: promptScore(block) + Math.min(block.length / 200, 5) }))
      .filter(item => item.block.length >= 20)
      .sort((a, b) => b.score - a.score);

    if (scored[0]?.score >= 3) return scored[0].block;

    const longLines = useful.filter(line => line.length >= 40);
    if (longLines.length) return longLines.join('\n\n');
    return useful.join('\n\n');
  }

  function firstSentenceTitle(prompt) {
    const value = cleanText(prompt);
    const cn = value.match(/[\u4e00-\u9fff][\u4e00-\u9fff，、：:；;（）()《》“”"'\sA-Za-z0-9-]{6,42}/);
    if (cn) return cleanTitle(cn[0]);
    const words = value.replace(/^prompt\s*[:：]\s*/i, '').split(/[\s,，.。;；]+/).filter(Boolean).slice(0, 8);
    while (words.length > 4 && /^(in|of|with|and|or|the|a|an|to|for)$/i.test(words[words.length - 1])) {
      words.pop();
    }
    return cleanTitle(words.join(' '));
  }

  function compactTitleFromPrompt(prompt) {
    const value = stripPublisherPreamble(prompt)
      .replace(/negative\s+prompt[\s\S]*$/i, '')
      .replace(/(?:no|without)\s+(?:text|watermark|logo|logos)(?:\s*,\s*(?:text|watermark|logo|logos))*/ig, '')
      .replace(/(?:不要|禁止|无)(?:文字|水印|logo|标志|商标)[，、,\s]*(?:文字|水印|logo|标志|商标)*/g, '');
    if (!value) return '';

    const specific = specificTitleFromPrompt(value);
    if (specific && !isWeakAutoTitle(specific)) return specific;

    const descriptive = descriptiveTitleFromPrompt(value);
    if (descriptive) return descriptive;

    if (specific) return specific;

    for (const rule of COMPACT_TITLE_RULES) {
      if (rule.pattern.test(value)) return rule.title;
    }

    const cn = value.match(/[\u4e00-\u9fff]{2,6}(?:人像|人物|写真|海报|短片|视频|主图|场景|角色|风景|空间|视觉)/);
    if (cn) return cleanTitle(cn[0]).slice(0, MAX_AUTO_TITLE_LENGTH);

    const fallback = firstSentenceTitle(value);
    if (/[\u4e00-\u9fff]/.test(fallback)) return fallback.slice(0, MAX_AUTO_TITLE_LENGTH);
    return 'AI提示词';
  }

  function specificTitleFromPrompt(prompt) {
    const value = cleanText(prompt);
    for (const rule of SPECIFIC_TITLE_RULES) {
      if (rule.pattern.test(value)) return rule.title;
    }

    const scene = pickFirst(value, TITLE_SCENE_TERMS);
    const detail = pickFirst(value, TITLE_DETAIL_TERMS);
    const subject = pickFirst(value, TITLE_SUBJECT_TERMS);

    if (isCompleteAutoTitle(scene)) return clipAutoTitle(scene);
    if (isCompleteAutoTitle(detail)) return clipAutoTitle(scene && !scene.includes(detail) && !detail.includes(scene) ? joinTitleParts(scene, detail) : detail);
    if (scene && detail) return clipAutoTitle(joinTitleParts(scene, detail, subject));
    if (detail && subject) return clipAutoTitle(joinTitleParts(detail, subject));
    if (scene && subject) return clipAutoTitle(joinTitleParts(scene, subject));
    if (scene && /(人像|portrait|woman|女性|girl|girl|female)/i.test(value)) return clipAutoTitle(scene + '人像');
    return '';
  }

  function descriptiveTitleFromPrompt(prompt) {
    const value = cleanText(prompt);
    const context = pickFirst(value, TITLE_CONTEXT_TERMS);
    const feature = pickFirst(value, TITLE_FEATURE_TERMS);
    const subject = pickFirst(value, TITLE_SUBJECT_TERMS);

    if (context && isConcreteTitle(context)) return clipAutoTitle(context);
    if (context && feature) return clipAutoTitle(joinTitleParts(context, feature, subject));
    if (context && subject) return clipAutoTitle(joinTitleParts(context, subject));
    if (feature && subject) return clipAutoTitle(joinTitleParts(feature, subject));
    return '';
  }

  function pickFirst(text, pairs) {
    const found = pairs.find(([, pattern]) => pattern.test(text));
    return found?.[0] || '';
  }

  function isCompleteAutoTitle(value) {
    if (value === '编辑写真') return false;
    return /(?:海报|详情页|提案|设计|广告|涂装|包装|工作流|技能|短片|视频|还原|合照|互动|滤镜|插画|截图|肖像|写真)$/.test(value || '');
  }

  function isConcreteTitle(value) {
    return /(?:自拍|人像|肖像|海报|界面|乐园|景观|变身|上色|短片|视频|场景|写真|广告)$/.test(value || '');
  }

  function isWeakAutoTitle(value) {
    return /^(?:编辑写真|电影感|写真人像|时尚人像|产品广告|品牌视觉)(?:女性人像|人像|肖像)?$/.test(value || '');
  }

  function joinTitleParts(...parts) {
    const words = parts.filter(Boolean);
    if (!words.length) return '';
    const result = [];
    for (const word of words) {
      const previous = result[result.length - 1] || '';
      if (!previous || !previous.includes(word)) result.push(word);
    }
    let title = result.join('');
    title = title
      .replace(/宋式留白宋式茶饮KV/g, '宋式茶饮文创KV')
      .replace(/旗袍唱片旗袍唱片写真/g, '旗袍唱片写真')
      .replace(/硬科幻沙漠硬科幻沙漠分镜/g, '硬科幻沙漠分镜')
      .replace(/玩偶棚拍泰迪熊棚拍人像/g, '泰迪熊棚拍人像')
      .replace(/窗边婚纱头纱婚纱照/g, '窗边头纱婚纱照')
      .replace(/女性人像女性人像/g, '女性人像')
      .replace(/人像女性人像/g, '人像')
      .replace(/海报产品海报/g, '海报')
      .replace(/视觉品牌视觉/g, '品牌视觉')
      .replace(/视频视频短片/g, '视频短片')
      .replace(/短片视频短片/g, '短片');
    return title;
  }

  function clipAutoTitle(value) {
    return cleanTitle(value).slice(0, MAX_AUTO_TITLE_LENGTH);
  }

  function titleLooksLikePrompt(title, prompt) {
    const t = cleanText(title);
    if (!t) return true;
    if (t.length > 72) return true;
    if (prompt && cleanText(prompt).startsWith(t) && t.length > 36) return true;
    return promptScore(t) >= 4 && t.length > 28;
  }

  function isGenericTitle(title) {
    const value = normalizeLabel(title);
    if (TITLE_NOISE_PATTERNS.some(pattern => pattern.test(value))) return true;
    if (BROAD_AUTO_TITLE_SET.has(value)) return true;
    if (isWeakAutoTitle(cleanTitle(title))) return true;
    return !value || [
      'prompt', '提示词', '完整提示词', '未命名提示词', 'untitled', 'image', 'result image',
      'portrait', 'video', 'photo', 'picture', '主页', '首页', '生成图', '结果图',
      'ai生成', 'ai generated', '编辑写真', '电影感', '请手动补充提示词', '（请手动补充提示词）'
    ].includes(value);
  }

  function normalizeAutoTitle(title, prompt) {
    let cleaned = cleanTitle(stripPublisherPreamble(title))
      .replace(/\s*[|｜/／]\s*(?:x|twitter|prompt|提示词).*$/i, '')
      .replace(/\s*(?:提示词|prompt)\s*$/i, '')
      .replace(/\s*(?:竖版|横版)\s*[\d:：xX×\s]*$/i, '')
      .replace(/[，,。；;：:].*$/g, '')
      .trim();

    if (
      cleaned &&
      /[\u4e00-\u9fff]/.test(cleaned) &&
      [...cleaned].length <= MAX_AUTO_TITLE_LENGTH &&
      !isGenericTitle(cleaned) &&
      !titleLooksLikePrompt(cleaned, prompt)
    ) {
      return cleaned;
    }

    const generated = compactTitleFromPrompt(prompt);
    return generated ? generated.slice(0, MAX_AUTO_TITLE_LENGTH) : DEFAULT_TITLE;
  }

  function cleanTitle(title) {
    return cleanText(title)
      .replace(/^(title|标题|prompt title|name|名称)\s*[:：]\s*/i, '')
      .replace(/^#+\s*/, '')
      .replace(/^["'“”‘’]+|["'“”‘’.,，。:：;；]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractTitle(lines, prompt, options) {
    const candidates = [];
    (options.titleCandidates || []).forEach(item => {
      if (item) candidates.push(item);
    });

    for (const line of lines) {
      const labeled = line.match(/^(title|标题|prompt title|name|名称)\s*[:：]\s*(.+)$/i);
      if (labeled?.[2]) candidates.unshift(labeled[2]);
    }

    const promptLabelIndex = lines.findIndex(isPromptLabel);
    const beforePrompt = promptLabelIndex >= 0 ? lines.slice(0, promptLabelIndex) : lines.slice(0, 8);
    beforePrompt.forEach(line => {
      if (!isNoiseLine(line) && !isPromptLabel(line)) candidates.push(line);
    });

    if (options.pageTitle) candidates.push(options.pageTitle.replace(/\s*[-|–—]\s*.*$/, ''));

    for (const candidate of candidates) {
      const normalized = normalizeAutoTitle(candidate, prompt);
      if (normalized && normalized !== DEFAULT_TITLE) return normalized;
    }

    return normalizeAutoTitle('', prompt);
  }

  function parsePromptText(rawText, options) {
    const opts = options || {};
    const text = stripPublisherPreamble(rawText);
    if (!text) return null;

    const imageUrls = extractImageUrls(text);
    const lines = splitLines(stripImageUrls(text));
    const prompt = cleanText(extractLabeledPrompt(lines) || extractUnlabeledPrompt(lines));
    if (!prompt) return null;

    return {
      title: extractTitle(lines, prompt, opts),
      prompt,
      imageUrls,
      confidence: Math.min(100, Math.round(promptScore(prompt) * 12 + Math.min(prompt.length / 20, 30)))
    };
  }

  return {
    DEFAULT_TITLE,
    cleanText,
    stripPublisherPreamble,
    extractImageUrls,
    compactTitleFromPrompt,
    normalizeAutoTitle,
    MAX_AUTO_TITLE_LENGTH,
    parsePromptText,
    looksLikePrompt,
    isCompletePrompt,
    isGenericTitle,
    titleLooksLikePrompt
  };
});
