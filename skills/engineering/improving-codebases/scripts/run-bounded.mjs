// The environment that every improving-codebases script gives a child process, git included.
// Importing this module runs nothing. Repository code runs in those children, so no variable
// outside the allowlist, such as a token or a GIT_DIR, reaches it; only the user widens it.

// Names a child process needs to find tools, write temporary files, and format text.
export const ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "TMPDIR",
  "JAVA_HOME",
]);

// Returns the allowlisted variables of `parent`, plus the `extraNames` the user passed with --env.
export function childEnv(extraNames = [], parent = process.env) {
  const env = {};
  for (const name of [...ENV_ALLOWLIST, ...extraNames]) {
    if (parent[name] !== undefined) env[name] = parent[name];
  }
  return env;
}
