# Dotfiles

Shared configuration for Jacob's machines. This repository provides Pi session
goals and approval-gated planning. Personal skills remain in the separate
[personal-codex-skills repository](https://github.com/jacobaclarke/personal-codex-skills).
The two Pi packages can be installed together.

## Install Pi planning on a Mac or Linux computer

Install [Pi](https://pi.dev/) first. This extension is tested with Pi 1.5.0 and
requires its extension APIs. Then clone this repository and install the package:

```sh
git clone https://github.com/jacobaclarke/dotfiles.git ~/repos/dotfiles
cd ~/repos/dotfiles
./scripts/install-pi.sh
```

The installer runs `pi install` against your local checkout, adding one package
to your personal Pi settings. It preserves existing models, packages, MCP
configuration, and credentials. The checkout can live anywhere; no home directory
or machine-specific paths are embedded in the extension.

Use `/reload` in an existing Pi session, or start a new session. The commands are
available in every project using that Pi agent directory. If you use multiple Pi
profiles with separate agent directories, run the installer under each profile's
normal environment. T3 or other hosts that disable package extensions need to
load this package through their own Pi resource configuration as well.

Alternatively, install directly from Git without maintaining an authoring checkout:

```sh
pi install git:github.com/jacobaclarke/dotfiles
```

Choose local-checkout **or** Git installation, not both, to avoid duplicate
commands and state handlers.

## Use a goal and plan

Start with the outcome you want, then inspect and review a plan before approving
implementation:

```text
/goal Add password reset with tests and no change to existing login behavior
/plan
```

Pi explores the project and saves an ordered plan with `update_plan`. Review the
steps, ask for changes if needed, then approve implementation:

```text
/execute
```

During execution, Pi updates step status and verifies the outcome. This is not
an autonomous background goal runner: it stops normally, stops for blockers, and
doesn't schedule work or start new runs when a goal remains incomplete.

| Command | Behavior |
| --- | --- |
| `/goal <outcome>` | Set an outcome and reset the previous plan; exits planning without starting work |
| `/goal` | Show the current goal, mode, steps, and last progress note |
| `/goal clear` | Clear the goal and steps; restore tools if planning |
| `/plan` | Enter read-only planning; with a saved goal, ask Pi to create or refine a plan |
| `/plan <task>` | Enter read-only planning and plan that task |
| `/plan off` | Exit planning without executing; retain the goal and progress |
| `/plan-status` | Show the goal and full step list |
| `/execute` | Approve the saved plan, restore previous tools, and start implementation |

`pi --plan` starts a session in planning mode. The footer shows the planning
mode or completed-step count. For normal multi-step requests, `update_plan` is
also available without entering read-only mode; it tracks work but doesn't
grant permission or change the available tools.

### Planning restrictions

While planning, only `read`, `grep`, `find`, `ls`, and `update_plan` are allowed.
Shell tools, `!`/`!!` shell commands, writes, MCP actions, unknown tools, and
wrappers such as `codemode` are blocked. Shell commands are not matched against
a regex allowlist: shell syntax and interpreters make such lists unreliable.
If planning needs a test run or shell-only inspection, Pi must ask you to exit
planning or approve execution first.

`/execute` restores the exact tool selection from before planning; it does not
enable every installed tool. Saving a plan never starts implementation. The
extension does not parse assistant prose for completion markers: Pi explicitly
records step statuses with `update_plan`.

This is a workflow gate, not an operating-system sandbox. Other extensions run
with your permissions and can perform their own work outside tool hooks. Only
load trusted extensions. Approval of a plan also does not authorize unrelated
destructive actions or external commitments.

### Where goals live

The goal, plan, mode, and progress are stored in the Pi session, not in this
repository. They survive `/reload` and session resume (`pi --continue` or
`/resume`), and follow the active branch when using `/tree` or forking a session.
A new session starts without a goal. Session-only context is supplied again on
each run so compaction doesn't discard the saved plan.

Installing this package across machines shares the **capability**, not active
goals or sessions. This is not a cross-project personal task database and does
not replace Reminders or Pages. No authentication, sessions, MCP secrets, or
personal goals should be committed to dotfiles.

## Update or remove

For a local-checkout installation, pull the configuration and reload Pi:

```sh
cd ~/repos/dotfiles
git pull --ff-only
```

Then use `/reload` or restart Pi. No reinstall is needed. For a Git installation,
run `pi update git:github.com/jacobaclarke/dotfiles`, then reload or restart.
Updates are explicit; this package doesn't pull or push repositories on startup.

Remove the package using the same source used during installation:

```sh
pi remove "$HOME/repos/dotfiles"
# Or, for a Git installation:
pi remove git:github.com/jacobaclarke/dotfiles
```

Reload or restart Pi after removal. This does not delete session history.

## Validate changes

With Node.js, Python 3, and Pi installed, run the dependency-free tests:

```sh
node --test tests/planning.test.mjs
python3 tests/planning-rpc.test.py
bash -n scripts/install-pi.sh
pi --offline --no-extensions --extension . --help
```

The tests load the TypeScript extension with Pi's installed loader dependencies
and exercise approval, tool restrictions, persistence, branch restoration,
validation, and progress reset. The RPC smoke test also starts a real Pi process
with temporary configuration to check command discovery and shell restrictions.
No provider request or API key is needed.

## Other configuration

The existing Neovim file is `.config/nvim/vim.init`; the Pi installer does not
modify or link it.
