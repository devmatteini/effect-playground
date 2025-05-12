import * as Effect from "effect/Effect"
import * as S from "effect/Schema"

namespace basic {
    const Person = S.Struct({
        name: S.String,
        age: S.NumberFromString,
    })

    interface PersonInterface extends S.Schema.Type<typeof Person> {}
    type PersonType = S.Schema.Type<typeof Person>
    type PersonEncoded = S.Schema.Encoded<typeof Person>
    type PersonContext = S.Schema.Context<typeof Person>
}

namespace opaqueTypes {
    const _Person = S.Struct({
        name: S.String,
        age: S.NumberFromString,
    })

    interface Person extends S.Schema.Type<typeof _Person> {}

    interface PersonEncoded extends S.Schema.Encoded<typeof _Person> {}

    // Re-declare the schema to create a schema with an opaque type
    const Person: S.Schema<Person, PersonEncoded> = _Person
}
