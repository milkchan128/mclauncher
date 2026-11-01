## Korean Encoding and Grammar Guidelines

- Use UTF-8 by default for all files and explicitly specify `encoding="utf-8"` for Python file I/O. Prevent Korean text corruption in Windows consoles, logs, and CSV files; use `utf-8-sig` for CSV when necessary.
- Never convert encodings arbitrarily or guess corrupted text. Verify the original encoding and root cause before fixing, then re-read modified files to confirm correct rendering.
- Ensure natural Korean grammar and spelling in comments, documentation, README files, UI text, and error messages while preserving existing terminology, meaning, and code behavior.
- Run available tests and linters after changes. Distinguish verified facts from assumptions and communicate with the user clearly and concisely in Korean.

## Caveman and Ponytail Usage

- Independently assess whether Caveman or Ponytail is appropriate for each task and use them when necessary.
- Select the most suitable option based on task complexity and requirements. Do not invoke either unnecessarily.

## Docker Prohibition

- Never use Docker, Docker Compose, or any Docker-based runtime environment.
- Do not create Docker-related files such as `Dockerfile`, `compose.yml`, or `docker-compose.yml`, or suggest Docker-based solutions.
- Do not execute or modify existing Docker configurations unless explicitly requested by the user.
- Prefer installing services and runtimes directly on the host OS or using the project's existing non-Docker setup.

## Timezone Configuration

- Handle all application dates and times using KST (`Asia/Seoul`), independently of the system timezone.
- Ensure consistent timezone handling across storage, calculations, and display, performing explicit conversions when necessary.
- Do not unnecessarily display `KST` or `Asia/Seoul` in the UI. Show timezone labels only when relevant or necessary for clarity.

## Codex Development Map Management

- Before starting work, read the **Development Map** section in the project's root `AGENTS.md` to understand its architecture, design decisions, and constraints.
- After completing **all user-requested tasks and passing tests and validation**, update the Development Map **as the final work step**. Skip the update if there are no relevant architectural or design changes.
- Keep the Development Map concise and focused on project structure, core features, key file responsibilities, dependencies, and design decisions needed for future work. Preserve all other existing instructions and create the section if it does not exist.

## Git Commit Rules

- After completing changes, run tests and validation. If successful, review `git status` and `git diff`, then create separate commits by feature or concern with concise, descriptive Korean commit messages.
- Never commit pre-existing changes or user-owned work without permission. Inform the user if changes cannot be safely separated. 
- After committing, verify the working tree status and report commit hashes and messages. Never run `git push`, force-push, or merge branches unless explicitly requested. Always honor requests not to commit.

## Final Instructions

- Do not start or run the development server after completing all tasks.
- Instead, provide the commands and instructions necessary for the user to start the development server manually.