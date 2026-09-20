# AGENTS.md

## 项目目标
构建一个「AI 广告投放 Copilot + 低代码搭建平台」Demo，覆盖：
1. 广告数据看板与复杂可视化
2. 自然语言创建广告投放计划
3. AI 文案/素材助手，流式输出
4. 低代码 Schema 生成与渲染
5. RAG 广告知识库问答
6. Agent Loop + Function Calling

## 技术栈
前端：React 18 + TypeScript + Vite + Ant Design + ECharts + Zustand + React Router
后端：Node.js + NestJS + PostgreSQL + Redis + Prisma
AI：LLM API、SSE、Function Calling、RAG、向量检索
测试：Vitest + Testing Library + Playwright
工程：ESLint + Prettier + GitHub Actions + Docker

## 常用命令
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build

## 目录结构
src/
  components/   通用组件
  pages/        页面
  services/     API 请求
  stores/       状态管理
  utils/        工具函数
  types/        类型定义
server/
  src/modules/  业务模块
  src/common/   通用能力
  src/ai/       LLM、Agent、RAG
  prisma/       数据库 schema

## 代码规范
- 使用函数组件 + Hooks
- 严格 TypeScript，禁止 any
- 组件必须可复用，复杂逻辑抽 hooks
- 异步必须有 loading、错误处理、空状态
- 新功能必须补 Vitest 单测
- 提交前必须跑 lint + typecheck + test
- 后端接口必须有 DTO、校验、错误码

## AI 协作流程
1. 先读 AGENTS.md、README、相关代码
2. 先输出实现计划，不要直接改代码
3. 我确认计划后，再小步实现
4. 每步必须跑 lint + typecheck + test
5. 测试失败先修根因，禁止降低断言
6. 完成后输出：变更摘要、风险点、回滚方式

## 禁止
- 不要引入未讨论的大型依赖
- 不要提交密钥、token、真实用户数据
- 不要跳过测试
- 不要改无关文件
- 不要直接改 main 分支

## 验收标准
- 功能可用
- 类型检查通过
- lint 通过
- 单测通过
- 关键路径有 E2E
- README 有架构图、启动方式、Demo 说明