# Dotfiles

Shell and editor configuration for Jacob's machines. The existing Neovim file is
`.config/nvim/vim.init`.

## Pi configuration moved

All shared agent configuration now lives in
[personal-codex-skills](https://github.com/jacobaclarke/personal-codex-skills),
including skills, prompt commands, daily sync, goals, and approval-gated planning.
This repository is no longer a Pi package. Don't install it with `pi install`.

If you installed the earlier local dotfiles package, migrate with:

```sh
pi remove "$HOME/repos/dotfiles"
```

If you installed from Git, remove that source instead:

```sh
pi remove git:github.com/jacobaclarke/dotfiles
```

Then update your existing `personal-codex-skills` checkout and install it:

```sh
cd ~/repos/personal-codex-skills
git pull --ff-only
pi install "$PWD"
```

For a new machine, follow the
[shared package setup instructions](https://github.com/jacobaclarke/personal-codex-skills#pi-setup-and-everyday-updates).
Use `/reload` or restart Pi after migration. Goals and plans already saved in Pi
sessions remain compatible; removing a package does not delete session history.
Don't keep both package sources installed.
