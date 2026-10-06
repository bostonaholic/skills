# jq Advanced Patterns

Advanced jq techniques for complex data transformations.

## Contents

- Variable Binding and Destructuring
- Reduce
- Foreach
- Custom Functions
- Recursive Processing
- Streaming
- Looping Constructs
- Complex Data Transformations
- Error Handling Patterns
- Performance Tips

## Variable Binding and Destructuring

```bash
# Bind a value to a variable
.items[] as $item | {name: $item.name, total: ($item.price * $item.qty)}

# Destructuring
. as {name: $n, age: $a} | "\($n) is \($a) years old"

# Array destructuring
. as [$first, $second] | {first: $first, second: $second}

# Alternative pattern (with //)
(.value // "default") as $v | {result: $v}
```

## Reduce

Fold an array into a single value with an accumulator.

```bash
# Syntax: reduce EXPR as $var (INIT; UPDATE)

# Sum
reduce .[] as $x (0; . + $x)

# Build object from array
reduce .[] as $item ({}; . + {($item.key): $item.value})

# Collect into an array
reduce range(5) as $i ([]; . + [$i * $i])
# [0, 1, 4, 9, 16]

# Count occurrences
reduce .[] as $word ({}; .[$word] += 1)

# Nested reduce — flatten and sum
reduce (.[][] | numbers) as $n (0; . + $n)
```

## Foreach

Iterate with state, optionally extracting intermediate values.

```bash
# Syntax: foreach EXPR as $var (INIT; UPDATE; EXTRACT)

# Running sum
[foreach .[] as $x (0; . + $x)]
# Input: [1,2,3] → Output: [1,3,6]

# Running average
[foreach .[] as $x ({n:0,sum:0}; .n += 1 | .sum += $x; .sum / .n)]

# Sliding pairs
[foreach .[] as $x ([]; .[-1:] + [$x]; select(length == 2))]
# Input: [1,2,3,4] → Output: [[1,2],[2,3],[3,4]]
```

## Custom Functions

```bash
# Zero-argument function
def double: . * 2;
[1,2,3] | map(double)  # [2,4,6]

# With parameters (semicolon-separated)
def addfield(name; value): . + {(name): value};
{} | addfield("x"; 1)  # {"x":1}

# Recursive function
def sigma: if . <= 0 then 0 else . + ((. - 1) | sigma) end;
5 | sigma  # 15

# Higher-order function (filter as parameter)
def mymap(f): [.[] | f];
[1,2,3] | mymap(. * 10)  # [10,20,30]

# Recursive tree traversal
def leaves: if type == "array" then .[] | leaves
             elif type == "object" then .[] | leaves
             else . end;
```

## Recursive Processing

```bash
# recurse — apply filter recursively
{"a":{"b":{"c":1}}} | recurse | numbers  # 1

# recurse with filter (stops when the filter produces nothing)
{"name":"root","children":[{"name":"a","children":[]}]} | [recurse(.children[]?) | .name]
# ["root","a"]

# recurse with condition
2 | recurse(. * 2; . < 100)  # 2,4,8,16,32,64

# walk — apply function to all values bottom-up
{"a":{"b":"hello"}} | walk(if type == "string" then ascii_upcase else . end)
# {"a":{"b":"HELLO"}}

# .. (recursive descent) — shorthand for recurse
{"a":{"b":1},"c":2} | .. | numbers  # 1, 2
```

## Streaming

Process large JSON without loading entirely into memory.

```bash
# tostream: convert to [path, leaf] events plus [path] closing events
{"a":1,"b":2} | tostream
# [["a"],1]
# [["b"],2]
# [["b"]]

# Emit each element of a huge top-level array without loading the whole file
jq -cn --stream 'fromstream(1 | truncate_stream(inputs))' huge.json

# Pick leaf values by key; length == 2 skips closing events, which would emit null
jq --stream 'select(length == 2 and .[0][-1] == "name") | .[1]' huge.json
```

## Looping Constructs

```bash
# while — loop while condition holds
1 | [while(. < 100; . * 2)]  # [1,2,4,8,16,32,64]

# until — loop until condition met
1 | until(. > 100; . * 2)    # 128

# recurse(f): apply f to its own output; bound it with limit
1 | limit(5; recurse(. * 2))  # 1,2,4,8,16

# label-break — break out of nested iteration
label $out | foreach range(10) as $i (
  0; . + $i;
  if . > 3 then ., break $out else . end
)
```

## Complex Data Transformations

### Pivot / reshape

```bash
# Long to wide (pivot)
# Input: [{"date":"2024-01","metric":"sales","value":100}, ...]
group_by(.date) | map({
  date: .[0].date,
  data: (map({(.metric): .value}) | add)
}) | map(. + .data | del(.data))

# Wide to long (unpivot)
# Input: {"date":"2024-01","sales":100,"returns":5}
. as $row | to_entries | map(select(.key != "date") | {
  date: $row.date,
  metric: .key,
  value: .value
})
```

### Join / merge datasets

```bash
# Attach each order's user by key (user is null when no match)
jq -n --slurpfile users users.json --slurpfile orders orders.json '
  ($users[0] | INDEX(.[]; .id)) as $idx |
  [$orders[0][] | . + {user: $idx[.user_id | tostring]}]
'

# Attach each user's orders (empty array when none)
jq -n --slurpfile users users.json --slurpfile orders orders.json '
  [$users[0][] as $u | $u + {orders: [$orders[0][] | select(.user_id == $u.id)]}]
'

# Merge objects from two files
jq -s '.[0] * .[1]' base.json overlay.json
```

### Tree operations

```bash
# Flatten nested tree to paths
def tree_paths:
  path(.. | scalars) as $p |
  {path: ($p | join(".")), value: getpath($p)};
[tree_paths]

# Transform all leaf values (trim: 1.8+)
walk(if type == "string" then gsub("\\s+"; " ") | trim else . end)

# Collect all values at any depth matching a key
.. | objects | select(has("email")) | .email
```

### Accumulate with state

```bash
# Running window average (window size 3)
def window_avg(n):
  reduce .[] as $x ({buf: [], avgs: []};
    .buf += [$x] |
    if (.buf | length) > n then .buf = .buf[1:] else . end |
    .avgs += [.buf | add / length]
  ) | .avgs;

# Deduplicate preserving first occurrence
reduce .[] as $item ({seen: {}, result: []};
  if .seen[$item.id | tostring] then .
  else .seen[$item.id | tostring] = true | .result += [$item]
  end
) | .result
```

## Error Handling Patterns

```bash
# Safe field access with default
(.config.timeout // 30) as $timeout | ...

# Try with fallback
try (.data | tonumber) catch 0

# Validate and fail fast
if (.version | type) != "string" then
  error("version must be a string, got: \(.version | type)")
else . end

# Collect errors
[.[] | {input: ., result: (try tonumber catch {error: .})}]

# Exit with status code
if .errors | length > 0 then
  .errors | halt_error(1)
else .data end
```

## Performance Tips

- Use `INDEX` to build lookup tables instead of nested `select` loops
- Use `--stream` for files too large to fit in memory
- Use `first(expr)` or `limit(n; expr)` instead of `[expr][0]` to stop early
