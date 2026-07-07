from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from app.models import get_chat_model
from app.tools import get_tool_belt

SYSTEM_PROMPT = (
    "You are a helpful assistant specialized in feline (cat) health. "
    "Use the retrieve_information tool for cat-health questions, web search for "
    "current information, and Arxiv for research papers. Cite tool results when "
    "they inform your answer."
)

# Hard cap on how many times the graph may loop back to the agent after a
# "not helpful" verdict. Without this, a hard-to-satisfy judge could loop
# forever and run up token cost in production.
MAX_HELPFULNESS_LOOPS = 3

HELPFULNESS_PROMPT = (
    "Given an initial user query and a final agent response, determine if the "
    "response is extremely helpful and fully addresses the query. Respond with "
    "only a single uppercase letter: 'Y' if it is helpful, or 'N' if it is not.\n\n"
    "Initial Query:\n{query}\n\n"
    "Final Response:\n{response}"
)


class HelpfulnessState(MessagesState):
    """Message state plus a counter that guards the retry loop."""

    loop_count: int


_tools = get_tool_belt()
_model_with_tools = get_chat_model().bind_tools(_tools)
# A separate, tool-free model instance acts as the judge.
_judge_model = get_chat_model()


def call_agent(state: HelpfulnessState) -> dict:
    """Invoke the tool-calling model, prepending the system prompt."""
    messages = [SystemMessage(content=SYSTEM_PROMPT), *state["messages"]]
    response = _model_with_tools.invoke(messages)
    return {"messages": [response]}


def check_helpfulness(state: HelpfulnessState) -> dict:
    """Judge whether the latest answer helpfully addresses the first user query."""
    query = next(
        (m.content for m in state["messages"] if isinstance(m, HumanMessage)),
        state["messages"][0].content,
    )
    response = state["messages"][-1].content

    verdict = _judge_model.invoke(
        HELPFULNESS_PROMPT.format(query=query, response=response)
    )
    helpful = "Y" in verdict.content.upper()

    return {
        "messages": [
            SystemMessage(
                content=f"[helpfulness check] verdict={'Y' if helpful else 'N'}",
                name="helpfulness",
            )
        ],
        "loop_count": state.get("loop_count", 0) + 1,
    }


def route_after_agent(state: HelpfulnessState) -> str:
    """If the agent requested tools, run them; otherwise judge the answer."""
    last_message = state["messages"][-1]
    if getattr(last_message, "tool_calls", None):
        return "action"
    return "helpfulness"


def route_after_helpfulness(state: HelpfulnessState) -> str:
    """Loop back to the agent unless the answer is helpful or we hit the cap."""
    verdict_message = state["messages"][-1]
    was_helpful = verdict_message.content.endswith("verdict=Y")

    if was_helpful or state.get("loop_count", 0) >= MAX_HELPFULNESS_LOOPS:
        return END
    return "agent"


_builder = StateGraph(HelpfulnessState)
_builder.add_node("agent", call_agent)
_builder.add_node("action", ToolNode(_tools))
_builder.add_node("helpfulness", check_helpfulness)

_builder.add_edge(START, "agent")
_builder.add_conditional_edges(
    "agent",
    route_after_agent,
    {"action": "action", "helpfulness": "helpfulness"},
)
_builder.add_edge("action", "agent")
_builder.add_conditional_edges(
    "helpfulness",
    route_after_helpfulness,
    {"agent": "agent", END: END},
)

graph = _builder.compile()
