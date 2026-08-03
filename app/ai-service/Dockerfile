FROM python:3.13-slim

WORKDIR /app

# 先拷贝依赖声明文件，最大化利用 Docker 层缓存（源码变更不影响依赖层）
COPY pyproject.toml README.md ./
COPY src ./src

# 仅安装核心依赖，可选依赖（analysis/rag/report）按部署阶段需要再扩展安装
RUN pip install --no-cache-dir -e .

EXPOSE 8090

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8090"]
