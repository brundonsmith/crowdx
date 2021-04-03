import { types } from "util";
import { observable, reaction, computed, action } from "./crowdx.mjs";

function test(fn) {
    const result = fn();

    if (result != null) {
        const description = typeof result === "string" ? `: "${result}"` : ``;
        console.error(`❌ ${fn.name}` + description)
    } else {
        console.log(`✅ ${fn.name}`)
    }
}

test(function testCreateObservableObject() {
    const obs = observable({
        foo1: "bar",
        foo2: 12,
        foo3: true,
    });

    if (typeof obs !== "object" || obs == null) {
        return "Failed to create observable object";
    }

    if (!types.isProxy(obs)) {
        return "New object is not Proxy";
    }

    if (obs.foo1 !== "bar") {
        return "String property was lost when creating observable";
    }

    if (obs.foo2 !== 12) {
        return "Number property was lost when creating observable";
    }

    if (obs.foo3 !== true) {
        return "Boolean property was lost when creating observable";
    }
})

test(function testCreateNestedObservableObjects() {
    const obs = observable({
        foo: {
            bar: "stuff",
        },
    });

    if (typeof obs.foo !== "object" || obs.foo == null) {
        return "Object property was lost when creating observable";
    }

    if (!types.isProxy(obs.foo)) {
        return "Nested object is not Proxy";
    }

    if (obs.foo.bar !== "stuff") {
        return "Deep string property was lost when creating observable";
    }
})

test(function testBasicReaction() {
    const obs = observable({
        foo: {
            bar: "stuff",
        },
    });

    let latestValue;
    reaction(
        () => obs.foo.bar, 
        str => latestValue = str)

    if (latestValue !== "stuff") return "Reaction didn't fire immediately";

    obs.foo.bar = "otherstuff";

    if (latestValue !== "otherstuff") return "Reaction didn't trigger when observable changed";
})

test(function testNewPropertyReaction() {
    const obs = observable({
        foo: {
            bar: 12,
        },
    });

    let latestValue;
    reaction(
        () => JSON.stringify(obs.foo), 
        str => latestValue = str)

    obs.foo.stuff = 4;

    if (latestValue !== `{"bar":12,"stuff":4}`) return "Reaction didn't trigger when property added to observable";
})

// TODO: Test whole-object reaction at root object?

test(function testSingleComputed() {
    const obs = observable({
        foo: {
            bar: "stuff",
        },
    });

    let latestValue;
    const strLength = computed(() => obs.foo.bar.length);
    reaction(strLength, len => latestValue = len);

    if (latestValue !== 5) return "Computed reaction didn't fire immediately";

    obs.foo.bar = "otherstuff";

    if (latestValue !== 10) return "Computed reaction didn't trigger when observable changed";
})

test(function testNestedComputed() {
    const obs = observable({
        foo: {
            bar: "stuff",
        },
    });

    let latestValue;
    const str = computed(() => obs.foo.bar);
    const strLength = computed(() => str().length);
    reaction(strLength, len => latestValue = len);

    if (latestValue !== 5) return "Computed reaction didn't fire immediately";

    obs.foo.bar = "otherstuff";

    if (latestValue !== 10) return "Computed reaction didn't trigger when observable changed";
})

test(function testAction() {
    const obs = observable({
        foo: {
            bar: "stuff",
            other: "otherstuff",
            otherother: "otherotherstuff",
        },
    });

    let reactions = 0;
    const combined = computed(() => obs.foo.bar + obs.foo.other);
    reaction(
        combined,
        () => reactions++)

    const change = action(() => {
        obs.foo.bar = "blah";
        obs.foo.other = "otherblah";
        obs.foo.otherother = "otherotherblah";
    })

    change();

    if (reactions !== 2) return `Action should have resulted in one reaction, but resulted in ${reactions - 1}`;
})