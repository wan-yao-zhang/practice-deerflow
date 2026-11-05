## 主关键词

新增 discoveries.primary_keyword（可为空）。新增页面抓取 TDH 成功后，取 URL 最后一个路径段，解码、去常见 HTML 扩展名，将连字符和下划线转空格，统一大小写及空白。Title 或 H1 包含完整短语才确认；Description 单独命中不确认。不调用大模型。

空路径、纯数字、无效编码及常见首页/栏目 slug 不确认。不自动删除 slug 中的编号，不做词干、同义词或模糊匹配。整段 slug 就是候选词，无法保证识别营销修饰词中的核心词。

动态列表和页面详情显示主关键词；旧记录使用已有 URL / Title / H1 即时计算展示，不写回数据库。原有关键词标签保留。

部署前先执行 npm run db:migrate:remote，再按现有流程部署。未执行数据库迁移时，新代码查询和写入该字段会失败。

规则检查：Node.js 22.18+ 执行 node check-keyword.mjs。
