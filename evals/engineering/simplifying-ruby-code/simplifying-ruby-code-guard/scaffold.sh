#!/usr/bin/env bash
set -euo pipefail

mkdir -p acme_maps
cat >acme_maps/point.py <<'EOF_1'
class Point:
    def __init__(self, x, y):
        self._x = x
        self._y = y

    @property
    def x(self):
        return self._x

    @property
    def y(self):
        return self._y

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return self._x == other._x and self._y == other._y

    def __hash__(self):
        return hash((self._x, self._y))
EOF_1

git init -q
git add -A
