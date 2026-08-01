已安装的环境

# Conda 环境

conda env list | grep form-agent

# form-agent (python 3.13.14)

# 核心依赖（已安装）

fastapi 0.138.0
uvicorn[standard] 0.49.0
httpx 0.28.1
pydantic 2.13.4
pydantic-settings 2.14.2
python-dotenv 1.2.2
启动命令

conda activate form-agent
cd app/ai-service
uvicorn src.main:app --host 0.0.0.0 --port 8090 --reload
启动后访问：

http://localhost:8090/docs — Swagger API 文档
http://localhost:8090/health — 健康检查
http://localhost:8090/api/v1/agent/chat — Agent 对话
