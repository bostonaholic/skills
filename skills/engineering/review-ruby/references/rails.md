# Rails Considerations

Apply these when the project's `Gemfile` declares the `rails` gem.

## Rails Anti-Patterns

- Reinventing ActiveRecord patterns

## ActiveRecord Models

- Keep as classes — benefit from OOP (associations, validations, callbacks)
- Extract business logic to pure functions/modules
- Use concerns for shared behavior across models, not as a dumping ground

## Service Objects in Rails

- **Single method, no state** -> move to model class method or module function
- **Complex orchestration** -> keep as service object but separate decisions from effects
- **Background jobs** -> appropriate use case for service objects (need serialization)

## Rails Helpers vs Modules

- View helpers for view-specific formatting only
- Business logic belongs in separate modules with `module_function`
- Do not mix view formatting with business rules
