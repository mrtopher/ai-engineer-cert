# scratch_query.py
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions  # pyright: ignore[reportMissingImports]

async def main():
    async for message in query(
        prompt="What does this project do? Answer in two sentences.",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Glob", "Grep"],
            cwd="/path/to/any/repo/you/like",
        ),
    ):
        print(type(message).__name__)          # watch the loop's anatomy
        if hasattr(message, "result"):
            print("\n" + message.result)

asyncio.run(main())