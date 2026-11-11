"""lowpoly MCP server 的煙霧測試：用 stdio 啟動伺服器，列出工具並實際呼叫。

    uv run --no-project --with "mcp>=2,<3" python tools/blender/tests/mcp_smoke.py

（不會被 run.py 收集：檔名不是 test_ 開頭，而且需要 mcp 套件）
"""

import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp_server", "server.py")
EXPECTED = {"lowpoly_list_plans", "lowpoly_validate_plan", "lowpoly_build_asset", "lowpoly_build_scene", "lowpoly_run_tests"}


def _payload(result):
    # mcp 2.x 改成 snake_case（structured_content／is_error）；保留 1.x 的名稱以防萬一
    structured = getattr(result, "structured_content", None) or getattr(result, "structuredContent", None)
    if structured:
        return structured
    return json.loads(result.content[0].text)


def _is_error(result):
    return bool(getattr(result, "is_error", None) or getattr(result, "isError", None))


async def main():
    failures = []

    def check(ok, message):
        print(f"{'PASS' if ok else 'FAIL'}  {message}")
        if not ok:
            failures.append(message)

    params = StdioServerParameters(command=sys.executable, args=[SERVER])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            names = {tool.name for tool in (await session.list_tools()).tools}
            check(EXPECTED <= names, f"工具：{sorted(names)}")

            plans = _payload(await session.call_tool("lowpoly_list_plans", {}))
            check(len(plans["plans"]) >= 8, f"列出 {len(plans['plans'])} 份 plan")

            valid = _payload(await session.call_tool("lowpoly_validate_plan", {"path": "test01_shop.plan.json"}))
            check(valid["ok"], "lowpoly_validate_plan(test01_shop) ok")

            outside = await session.call_tool("lowpoly_validate_plan", {"path": "/etc/hosts"})
            check(_is_error(outside), "專案外的檔案被拒絕")

            built = _payload(await session.call_tool("lowpoly_build_asset", {"plan": "tree_round.plan.json"}))
            check(built["ok"] and built["triangles"] > 0, f"lowpoly_build_asset(tree_round) ok，三角面 {built.get('triangles')}")
    print("\nALL PASS" if not failures else f"\n{len(failures)} FAILED")
    sys.exit(1 if failures else 0)


asyncio.run(main())
