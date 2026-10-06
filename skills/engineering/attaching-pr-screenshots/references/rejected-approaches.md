# Rejected approaches

Each route below was tried and dropped. Do not improvise it.

1. **Rejected: commit the images to an orphan branch and link the blob URL.**
   Push the PNGs to a throwaway branch, then reference
   `https://github.com/<owner>/<repo>/blob/<sha>/<file>?raw=1` from the PR
   body. _Why rejected:_ two independent reasons, and each is sufficient.
   First, the images are deleted with the branch, so routine branch cleanup
   silently empties the PR of its screenshots and a merged PR keeps the dead
   references forever. Second, on a private repository that URL is a
   **web-session** URL: a token-authenticated fetch returns 404 while a
   signed-in reviewer sees the image, and a fetch with no session returns 404
   whether the blob exists or not. So "the blob exists" is never evidence the
   image renders, and a successful raw fetch is never evidence a reviewer can
   see it.

2. **Rejected: a headless browser on a persistent signed-in profile.**
   Drive github.com's own markdown textarea with a browser launched against a
   long-lived profile directory, and read the resolved URL out of the textarea.
   _Why rejected:_ a second unencrypted credential store and a manual one-time
   sign-in that no autonomous run can perform; the attach flag on the existing,
   already-authenticated CLI does the same job under one identity.
