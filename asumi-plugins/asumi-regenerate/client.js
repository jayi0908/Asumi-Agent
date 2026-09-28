window.__ModuleLoader__.load({
	id: "asumi-plugin-regenerate",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const jsx = jsxRuntime.jsx;
		const jsxs = jsxRuntime.jsxs;

		/**
		 * Asumi's regenerate action, browser half.
		 *
		 * One button in the finalized assistant message's action strip — the row
		 * that already holds copy and branch. It rolls the turn back to before
		 * this answer and asks the question again.
		 *
		 * DSH has no history rewind: the Session API offers create, fork, prompt,
		 * cancel, rename, and queue mutation, and nothing removes or rewrites
		 * durable messages. So "replace this answer in place" and the Web client's
		 * same-screen variant arrows are both out of reach — they would need
		 * turn-level replay in the engine. What `fork` does give is a rollback:
		 * it cuts at a **completed-turn boundary**, so cutting at the *previous*
		 * turn's end yields a child holding every turn before this one plus the
		 * question, with no answer. Re-asking there produces a fresh answer while
		 * the original stays in the source Session (the sidebar nests the child
		 * under it), so both results remain available.
		 *
		 * The fork boundary is why the cut is taken from the timeline rather than
		 * from the message: anchoring at this answer's own seq would resolve to
		 * the *current* turn's end and keep the answer we are trying to drop.
		 *
		 * @module asumi-plugin-regenerate/client
		 */

		const CSS =
			".asumi-regenerate{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}" +
			".asumi-regenerate svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}" +
			".asumi-regenerate:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}" +
			".asumi-regenerate[data-failed]{color:var(--dsw-alias-state-error-primary)}" +
			".asumi-regenerate:disabled{cursor:default;opacity:.5}" +
			".asumi-regenerate:disabled svg{animation:asumi-regenerate-spin .8s linear infinite}" +
			"@keyframes asumi-regenerate-spin{to{transform:rotate(360deg)}}" +
			"@media (prefers-reduced-motion:reduce){.asumi-regenerate:disabled svg{animation:none}}";

		function injectStyle() {
			if (typeof document === "undefined") return;
			const tagId = "asumi-plugin-regenerate/regenerate.css";
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "asumi-plugin-regenerate";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/** Read the plain text of one user message, ignoring its non-text blocks. */
		function textOf(content) {
			if (!Array.isArray(content)) return "";
			let text = "";
			for (const block of content) {
				if (block && block.type === "text" && typeof block.text === "string") text += block.text;
			}
			return text;
		}

		/** The source Session's working directory, used when a cut has no turn to fork at. */
		function sessionCwd(ctx, sessionId) {
			const state = ctx.sessions.list.getSnapshot();
			const row = state === undefined || state.byId === undefined ? undefined : state.byId[sessionId];
			return row === undefined ? undefined : row.cwd;
		}

		/** The workspace owning one directory, so a first-turn replacement lands beside the source. */
		function workspaceFor(ctx, cwd) {
			const service = ctx.uiWorkspace;
			if (service === undefined || service.workspaces === undefined || cwd === undefined) return undefined;
			const state = service.workspaces.list.getSnapshot();
			const items = state === undefined || state.items === undefined ? [] : state.items;
			return items.find((item) => item.path === cwd);
		}

		/** Wait for a freshly forked child to become addressable, up to a second. */
		async function waitForSession(ctx, sessionId) {
			for (let attempt = 0; attempt < 20; attempt += 1) {
				const binding = ctx.sessions.binding(sessionId);
				if (binding !== undefined && binding.session !== undefined) return binding.session;
				await new Promise((resolve) => window.setTimeout(resolve, 50));
			}
			return undefined;
		}

		/** A correlation id for the kick prompt, without assuming `crypto.randomUUID`. */
		function newRequestId() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			return `asumi-regenerate-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
		}

		/** Withdraw our kick prompt from the queue before the next turn claims it. */
		async function dropQueued(session, requestId) {
			for (let attempt = 0; attempt < 100; attempt += 1) {
				const snapshot = session.getSnapshot();
				const queue = snapshot === undefined || snapshot.queue === undefined ? [] : snapshot.queue;
				const mine = queue.find((item) => item.rpcId === requestId);
				if (mine !== undefined) {
					await session.updateQueue(mine.id, { kind: "remove" });
					return true;
				}
				await new Promise((resolve) => window.setTimeout(resolve, 25));
			}
			return false;
		}

		/**
		 * Roll the turn back and re-ask its question in a fork.
		 *
		 * The question is read back out of the loaded Chat nodes rather than kept
		 * from the click, because the action can outlive the turn that produced it
		 * (a reload restores the strip). The nearest preceding user node is the
		 * turn's question — context, steering, and tool nodes may sit between it
		 * and the closing answer.
		 *
		 * @param ctx - client root context.
		 * @param sessionId - Session the action was rendered in.
		 * @param messageId - durable id of the answer being regenerated.
		 * @returns whether a prompt was accepted.
		 */
		async function regenerate(ctx, sessionId, messageId) {
			const binding = ctx.sessions.binding(sessionId);
			if (binding === undefined || binding.session === undefined) return false;

			const conversation = ctx.uiConversation.binding(sessionId);
			conversation.activate("chat");
			const snapshot = conversation.target("chat").getSnapshot();
			const nodes = snapshot === undefined || snapshot.legacy === undefined ? [] : snapshot.legacy.nodes;

			const index = nodes.findIndex((node) => node.kind === "assistant" && node.messageId === messageId);
			if (index < 0) return false;

			let question;
			for (let i = index - 1; i >= 0; i -= 1) {
				if (nodes[i].kind === "user") {
					question = nodes[i];
					break;
				}
			}
			if (question === undefined) return false;

			const text = textOf(question.content);
			if (text.trim() === "") return false;

			const timeline = snapshot.timeline;
			const previous = timeline === undefined ? undefined : timeline.turns.get(nodes[index].turn - 1);
			const atSeq = previous === undefined || previous.end === undefined ? undefined : previous.end.seq;

			let childId;
			let forked = false;
			try {
				if (atSeq === undefined) {
					// The answer is in the first turn: there is no earlier turn/end to cut
					// at, so start a sibling Session on the same workspace (or directory).
					const cwd = sessionCwd(ctx, sessionId);
					const workspace = workspaceFor(ctx, cwd);
					if (workspace !== undefined) childId = await ctx.sessions.create({ workspaceId: workspace.workspaceId });
					else if (cwd !== undefined) childId = await ctx.sessions.create({ cwd });
					else return false;
				} else {
					childId = await ctx.sessions.fork({ sessionId, atSeq, increaseTitle: true });
					forked = true;
				}
			} catch {
				return false;
			}

			ctx.sessions.open(childId);
			const child = await waitForSession(ctx, childId);
			if (child === undefined) return false;

			// A fork's seed ends at the asked turn's `turn/start`, so it carries the
			// inbox admission of that turn's question: the question is already queued
			// in the child, it just is not driven until something prompts the Agent.
			// A plain prompt would therefore run the inherited copy *and* insert a
			// second one. Instead our prompt is only a kick — sent under a known
			// requestId and withdrawn before the next turn can claim it — so the
			// inherited question is what gets answered, exactly once.
			const requestId = newRequestId();
			const result = await child.prompt([{ type: "text", text }], "queue", undefined, requestId);
			if (result === undefined || !result.ok) return false;
			if (forked) await dropQueued(child, requestId);
			return true;
		}

		const LABELS = {
			idle: "重新生成",
			pending: "正在重新生成…",
			failed: "重新生成失败"
		};

		const RegenerateAction = react.memo(function RegenerateAction({ messageId, regenerate: run }) {
			const [state, setState] = react.useState("idle");
			const alive = react.useRef(true);
			const pending = react.useRef(false);
			react.useEffect(() => () => {
				alive.current = false;
			}, []);

			const settle = react.useCallback((ok) => {
				pending.current = false;
				if (!alive.current) return;
				setState(ok ? "idle" : "failed");
				if (!ok) window.setTimeout(() => {
					if (alive.current) setState("idle");
				}, 1800);
			}, []);

			const onClick = react.useCallback(() => {
				if (pending.current) return;
				pending.current = true;
				setState("pending");
				Promise.resolve()
					.then(() => run(messageId))
					.then(settle, () => settle(false));
			}, [messageId, run, settle]);

			const label = LABELS[state];
			return jsx("button", {
				type: "button",
				className: "asumi-regenerate",
				"aria-label": label,
				title: label,
				disabled: state === "pending",
				"data-failed": state === "failed" ? "" : undefined,
				onClick,
				children: jsxs("svg", {
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					children: [
						jsx("polyline", { points: "23 4 23 10 17 10" }),
						jsx("polyline", { points: "1 20 1 14 7 14" }),
						jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })
					]
				})
			});
		});

		/** Required services: the slot registry, the Session object layer, the Conversation assembly, and workspace lookup. */
		const inject = ["slots", "sessions", "uiConversation", "uiWorkspace"];

		/**
		 * Client plugin body: one entry in the assistant action strip.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			injectStyle();
			ctx.slots.inject("conversation.chat.assistant-actions", () =>
				ctx.slots.register(
					{
						name: "conversation.chat.assistant-actions",
						id: "asumi-regenerate",
						order: 20,
						inject: (sessionId) => ({
							regenerate: (messageId) => regenerate(ctx, sessionId, messageId)
						})
					},
					RegenerateAction
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
