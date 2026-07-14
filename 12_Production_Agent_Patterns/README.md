

# Session 12: Production Agent Patterns - Guardrails, Caching, and A2A

### [Quicklinks](https://github.com/AI-Maker-Space/The-AI-Engineering-Certification-v1.0/tree/main/00_Docs/Modules)


| 📰 Session Sheet                      | ⏺️ Recording | 🖼️ Slides | 👨‍💻 Repo    | 📝 Homework | 📁 Feedback |
| ------------------------------------- | ------------ | ---------- | ------------- | ----------- | ----------- |
| [Session 12: Production 101: Guardrails & Caching](https://github.com/AI-Maker-Space/The-AI-Engineering-Certification-v1.0/tree/main/00_Docs/Modules/12_Production) |[Recording!](https://us02web.zoom.us/rec/share/Yx3VqEBLbCZAXsjTL1L98NupP5hfadVQUYIvV3BX94edcmkRJAKczcUAKZ0NMGtQ.aDpXtTci_YW4ovbs) <br> passcode: `6JWfF%r&`| [Session 12 Slides](https://canva.link/mu8p2oni7jylf95) |You are here! | [Optional Session 12 Assignment](https://forms.gle/PVMnzonTDGoaNwZ48) | [Feedback 7/9](https://forms.gle/NVyhkaEERgB9zhGQ7) |




## Main Assignment

Previous sessions built, evaluated, and served the cat health agent. Session 12 prepares it for production with three small, self-contained concepts:

```text
01 Guardrails -> control what goes into and comes out of the agent   (notebook)
02 Caching    -> stop paying for the same answer twice               (notebook)
a2a/          -> let your agent talk to other agents over a protocol (runnable mini-project)
```

Each part is deliberately short: one new concept and a handful of tasks. The parts are independent — there is no set order or outline for this session. Pick whichever interests you most, or work through all three.

## The Parts

**`01_Cat_Health_Agent_Guardrails.ipynb`** — Build layered guardrails around the agent: deterministic input rails (emergency escalation, injection blocking, PII redaction), a model-based topical guard, and output rails that check and repair draft replies, wired into the agent loop with LangChain middleware.

**`02_Cat_Health_Agent_Caching.ipynb`** — Stop paying for repeated work: exact-match response caching, a from-scratch semantic cache (and why it is dangerous in a health domain), embedding and tool-result caches, and provider-side prompt caching you can measure in the usage details.

**`a2a/`** — Build the A2A protocol from the wire up: a specialist agent behind a minimal A2A server (`server.py`), a discovery-driven client (`client.py`), and a front-desk agent that delegates across the protocol (`front_desk.py`). Start with [`a2a/README.md`](a2a/README.md) — it walks through starting the server and testing it with curl, the client, the delegation demo, and a no-API-key smoke test.

## Setup

From this folder, install the environment with uv:

```bash
uv sync
```

Then open the notebooks in Cursor or VS Code and select the Python/Jupyter environment created by uv.

You will need an OpenAI API key available when running the notebooks:

```bash
export OPENAI_API_KEY="your-key"
```

Optional LangSmith tracing:

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY="your-key"
```

The `a2a/` mini-project starts a local HTTP server on port 9999. Nothing leaves your machine; stop it with `Ctrl+C`.

## Questions

### ❓ Question #1

In `01_Cat_Health_Agent_Guardrails.ipynb`, input rails run in a specific order: deterministic checks (emergency, injection, PII) first, then the model-based topical guard. Why is that ordering important in production — and why do the rails return decisions like `escalate`, `block`, and `rewrite` instead of a simple boolean pass/fail?

#### ✅ Answer

Deterministic checks run first because they are cheap, fast, and can't be manipulated by the input itself. Emergencies must escalate before anything else can delay them; injection must be caught *before* untrusted text reaches an LLM (including the topical guard), or the attacker could subvert that guard too; and PII should be redacted before the text is sent to any model or logged. The model-based guard runs last as the most expensive and least reliable layer, and only on input that already survived the hard rails — this is cheapest-and-safest-first, fail-fast ordering.

The rails return `escalate` / `block` / `rewrite` instead of a boolean because each risk needs a *different response*, and a pass/fail flag throws that information away. An emergency isn't "fail," it's "route to a human now"; injection is "reject"; PII is "sanitize and continue." A typed decision lets the agent loop take the correct action per case and stay auditable, rather than collapsing distinct safety outcomes into one blunt reject.

### ❓ Question #2

In `02_Cat_Health_Agent_Caching.ipynb`, a semantic cache can serve a paraphrased FAQ for the price of one embedding call — but the notebook also shows how a one-word difference (treat vs. poison) can produce a catastrophic cache hit. Why can't you fix this with a better similarity threshold alone, and what should a production health agent do instead for high-stakes queries?

#### ✅ Answer

A threshold can't fix it because embedding similarity measures *surface/topical* closeness, not clinical meaning. "Can cats eat X as a treat?" and "Is X a poison for cats?" are lexically and topically near-identical — same words, same subject — so they sit close in embedding space even though the correct answers are opposites. There's no threshold that separates them without also rejecting the genuine paraphrases the cache exists to catch: tighten it and you lose all the benefit, loosen it and you serve the dangerous hit. The distinction lives in semantics the embedding doesn't encode.

For high-stakes queries a production health agent should not rely on semantic caching at all. Classify risk first and route accordingly: safe general FAQs can use the semantic cache, but anything safety-critical (toxicity, dosing, symptoms, emergencies) should bypass it and always go to a fresh model call — or fall back to exact-match caching only, where a cache key is a literal string and can't collapse "treat" into "poison." Cache the cheap-to-be-wrong; never cache where a wrong answer harms the cat.

## Submitting Your Homework

Follow these steps to prepare and submit your homework:

1. Pull the latest updates from upstream into the main branch of your AIE9 repo:

```bash
git checkout main
git pull upstream main
git push origin main
```

1. Start Cursor from the `12_Production_Agent_Patterns` folder.
2. Work through the parts you chose (notebooks and/or the `a2a/` mini-project).
3. Keep useful outputs that help explain your work — for example guardrail decision tables, cache hit/miss timings, or the A2A delegation trace. Remove secrets and excessively noisy outputs.
4. Add, commit, and push your modified work to your origin repository.

When submitting your homework, provide the GitHub URL to your AIE9 repo.
