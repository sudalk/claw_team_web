"""LLM Client - 统一的 LLM 调用封装，支持 Anthropic 和 MiniMax"""

from typing import Optional
from anthropic import Anthropic

from backend.core.config import settings


class LLMClient:
    """统一的 LLM 客户端，支持 Anthropic 和 MiniMax"""

    def __init__(self):
        self.provider = settings.llm_provider  # "anthropic" | "minimax"
        self.base_url = settings.llm_base_url

        if self.provider == "minimax":
            # MiniMax 兼容 Anthropic 格式
            self.client = Anthropic(
                base_url=self.base_url,
                api_key=settings.llm_api_key,
            )
        else:
            # Anthropic 原生
            self.client = Anthropic(
                api_key=settings.llm_api_key,
            )

    def chat(
        self,
        messages: list,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs
    ):
        """发送对话请求"""
        return self.client.messages.create(
            model=model or settings.llm_model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
            **kwargs
        )

    def simple_chat(self, prompt: str, model: Optional[str] = None) -> str:
        """简单的单轮对话"""
        response = self.chat([
            {"role": "user", "content": prompt}
        ], model=model)
        return response.content[0].text

    def structured_output(
        self,
        prompt: str,
        system: Optional[str] = None,
        json_schema: Optional[dict] = None,
    ) -> dict:
        """返回结构化 JSON 输出"""
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        # 添加 JSON Schema 约束
        if json_schema:
            schema_prompt = f"""
请严格按照以下 JSON Schema 输出，不要添加任何额外解释：

```json
{json.dumps(json_schema, ensure_ascii=False, indent=2)}
```
"""
            messages[-1]["content"] = prompt + "\n\n" + schema_prompt

        response = self.chat(messages)
        text = response.content[0].text

        # 提取 JSON
        import json as json_lib
        import re

        # 尝试提取 ```json ... ``` 块
        match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if match:
            text = match.group(1)

        # 尝试直接解析
        try:
            return json_lib.loads(text)
        except json_lib.JSONDecodeError:
            # 尝试找到 JSON 对象的开始和结束
            start = text.find('{')
            end = text.rfind('}') + 1
            if start != -1 and end > start:
                return json_lib.loads(text[start:end])
            raise ValueError(f"无法解析 JSON: {text[:200]}...")


# 全局单例
llm_client = LLMClient()
