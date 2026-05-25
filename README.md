# AIGC 文本润色工具

这是一个可单容器部署的 AIGC 文本润色 / 降机器感工具，包含前端页面、后端 API、卡密登录、管理员后台、SQLite 数据库和 Docker 部署文件。

## 功能

- 首页直接粘贴文本或上传 TXT / Word / PDF。
- 支持三种润色模式：轻度润色、AIGC 降重润色、深度改写。
- 支持接入腾讯云文本内容安全 AI生成检测，展示 AI率百分比和风险提示。
- 短文本支持左右主编辑区红绿对比，长文自动关闭重型精细对比以保证稳定。
- 卡密登录和自动扣点，兑换后开始计时。
- 管理后台可生成用户卡密、管理员卡密，管理卡密状态，更新润色规则。
- 润色记录和文档按 24 小时保留，过期后清理。

## 开源说明

本项目采用 MIT License 开源。

你可以自由使用、复制、修改、二次开发、部署、分发和商用本项目代码，也可以基于本项目开发自己的产品或服务。使用时请保留原始版权声明和 MIT 许可声明。

本仓库只提供项目源码和部署方式，不包含任何可直接使用的模型密钥、真实卡密、用户数据或数据库文件。部署到生产环境前，请自行配置 `.env`，并更换 `SESSION_SECRET`、`GROK_API_KEY` 和 `BOOTSTRAP_ADMIN_CARD`。

## 快速启动

服务器需要已安装 Docker 和 Docker Compose。克隆源码后执行：

```bash
cp .env.example .env
nano .env
docker compose up -d --build
```

访问：

```text
http://服务器IP:3000
```

## 环境变量

`.env` 至少需要配置下面几项：

```env
GROK_API_URL=http://你的模型服务/v1/chat/completions
GROK_MODEL=grok-4.20-fast
GROK_API_KEY=你的模型key
TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey
TENCENT_REGION=ap-guangzhou
TENCENT_AIGC_BIZ_TYPE=你的AI生成检测BizType
SESSION_SECRET=换成一段足够长的随机字符串
BOOTSTRAP_ADMIN_CARD=换成你的首次管理员卡密
NEXT_PUBLIC_API_BASE_URL=
CORS_ORIGINS=
PORT=3000
HOSTNAME=0.0.0.0
```

说明：

- `BOOTSTRAP_ADMIN_CARD` 是首次部署用的管理员卡密，启动后可用它登录 `/login` 进入 `/admin`。
- `TENCENT_AIGC_BIZ_TYPE` 需要在腾讯云文本内容安全控制台创建 AI生成检测策略后复制。
- AIGC 检测默认关闭；用户开启“润色后检测”后，润色成功才会自动检测改写结果一次。
- 同一个润色任务的检测报告会缓存，24小时记录期内重复查看不会再次调用腾讯云、不会重复产生检测成本。
- 腾讯云单次检测建议控制在 2000 字以内，长文档可拆分重点段落处理。
- 管理员进入后台后，可以继续生成新的管理员卡密和用户卡密。
- 生产环境务必更换 `SESSION_SECRET` 和 `BOOTSTRAP_ADMIN_CARD`。
- 单容器部署时 `NEXT_PUBLIC_API_BASE_URL` 保持为空，前端会请求同域 API。
- SQLite 数据库保存在宿主机 `./data/aigc-polish.sqlite`，容器重建不会丢数据。

## 常用命令

```bash
# 启动或更新
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 停止
docker compose down
```

## 反向代理

如果使用 Nginx 或 1Panel，把域名反向代理到容器端口即可：

```text
http://127.0.0.1:3000
```

Nginx 示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 数据备份

```bash
mkdir -p backups
cp data/aigc-polish.sqlite backups/aigc-polish-$(date +%F-%H%M%S).sqlite
```

不要把真实 `.env`、`data` 数据库、卡密导出文件提交到 GitHub。
