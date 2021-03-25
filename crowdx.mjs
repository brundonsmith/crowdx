
/**
 * This singleton holds all global state related to creating, maintaining, and
 * triggering subscriptions
 */
class CrowdXTrackingStore {


    /**
     * This is a mapping from observables (Symbols) to the Set of functions that
     * should be triggered upon their publication
     */
    observableMappings = new Map();


    /**
     * When a tracted function is being tracked, a reference to it is kept in 
     * currentTrackedFunction and the observables it encounters are registered 
     * in currentTrackedObservables. When the function completes, all 
     * observables that were found get subscribed-to, and these pieces of state 
     * get cleared.
     */
    currentTrackedFunction = null;
    currentTrackedObservables = null;
    beginTracking(func) {
        this.currentTrackedFunction = func;
        this.currentTrackedObservables = new Set();
    }
    completeTracking() {
        for (const observable of this.currentTrackedObservables) {
            if (!this.observableMappings.has(observable)) {
                this.observableMappings.set(observable, new Set());
            }

            this.observableMappings.get(observable).add(this.currentTrackedFunction);
        }

        this.currentTrackedFunction = null;
        this.currentTrackedObservables = null;
    }

    
    /**
     * Given an observable, tracks it in the context of the currently-running 
     * tracked function, if any.
     */
    track(observable) {
        if (this.currentTrackedFunction != null) {
            this.currentTrackedObservables.add(observable);
        }
    }


    /**
     * When an action begins, all publication of changes to observables is 
     * suspended and those observables are instead tracked in 
     * currentActionObservables. Once the action is complete, all of those 
     * observables finally publish at once, with a consistent app state.
     */
    currentActionObservables = null;
    beginAction() {
        this.currentActionObservables = new Set();
    }
    completeAction() {
        const observables = this.currentActionObservables;
        this.currentActionObservables = null;

        this.publishAll(observables);
    }


    /**
     * Given an observable, runs all corresponding reactions.
     */
    publish(observable) {
        if (this.observableMappings.has(observable)) {
            if (this.currentActionObservables != null) {
                this.currentActionObservables.add(observable);
            } else {
                for (const reaction of this.observableMappings.get(observable)) {
                    reaction();
                }
            }
        }
    }

    
    /**
     * Given multiple observables, runs all corresponding reactions. They get
     * combined into a single Set so that if there are duplicates (multiple 
     * observables trigger the same reactions), those only run once.
     */
    publishAll(observables) {
        if (this.currentActionObservables != null) {
            for (const observable of observables) {
                this.currentActionObservables.add(observable);
            }
        } else {
            const allReactions = new Set();
            for (const observable of observables) {
                if (this.observableMappings.has(observable)) {
                    for (const reaction of this.observableMappings.get(observable)) {
                        allReactions.add(reaction);
                    }
                }
            }

            for (const reaction of allReactions) {
                reaction();
            }
        }
    }
}


/**
 * Singelton instance of CrowdXTrackingStore
 */
const subscriptionsStore = new CrowdXTrackingStore();


/**
 * Used to store/retrieve a hidden property on observable objects referring to
 * their parent observable (if any). This is needed for cases where a change to 
 * the observable object doesn't affect any of its known (observed properties),
 * but needs to let any parent know which might have iterated over its members.
 */
const PARENT_OBSERVABLE = Symbol("PARENT_OBSERVABLE");

/**
 * Used to store/retrieve a hidden property on observable objects referring to
 * the collection of observable symbols for each of its enumerable properties.
 * These are used for publication/subscription.
 */
const OBSERVABLE_HANDLES = Symbol("OBSERVABLE_HANDLES");

/**
 * Unlike objects, arrays have mutation methods that we need to handle correctly
 * for publishing. Each method in this list will be wrapped in a new function 
 * that causes the entire array to be published as a whole, not just one of its 
 * members.
 */
const ARRAY_MUTATION_METHODS = [ "push", "pop", "fill", "splice", "sort", 
"reverse", "shift", "unshift" ];

/**
 * This defines the JS Proxy behavior for our observable objects.
 */
const proxyHandler = {

    /**
     * We override the property getter so that if we're currently running a 
     * tracked function, the accessed property's observable symbol will be 
     * registered to the ongoing function for publication 
     * (via subscriptionsStore.currentTrackedObservables).
     * 
     * We also take this opportunity to swap certain methods on the Array object
     * for ones that will publish their mutations correctly 
     * (see ARRAY_MUTATION_METHODS).
     */
    get: function (target, prop) {
        if (Array.isArray(target) && ARRAY_MUTATION_METHODS.includes(prop)) {
            return function(...args) {
                const res = target[prop](...args);
                subscriptionsStore.publish(target[PARENT_OBSERVABLE]);
                return res;
            };
        } else {
            if (target[OBSERVABLE_HANDLES].hasOwnProperty(prop)) {
                subscriptionsStore.track(target[OBSERVABLE_HANDLES][prop]);
            }
    
            return target[prop];
        }
    },

    /**
     * We override the property setter to publish to the relevant observable 
     * when a new value is assigned to an observable property.
     * 
     * We also call observable() on the provided value, to make sure our entire
     * object tree remains observable all the way down.
     */
    set: function (target, prop, value) {
        const newProperty = !Object.keys(target).includes(prop);
        target[prop] = observable(value, target[OBSERVABLE_HANDLES][prop]);

        if (newProperty) {
            subscriptionsStore.publish(target[PARENT_OBSERVABLE]);
            target[OBSERVABLE_HANDLES][prop] = Symbol(prop);
        } else {
            subscriptionsStore.publish(target[OBSERVABLE_HANDLES][prop]);
        }

        return true;
    },
};




// ------------- External API -------------

/**
 * Takes any JSON-like value and makes it observable. If it is not an object or 
 * array, or if it's already observable, this function does nothing. Otherwise, 
 * any changes to the properties/contents of val will be tracked by tracked 
 * functions. It will also recurse on all of val's children, and their children, 
 * etc.
 * 
 * NOTE: Because of the need for proxying, this function returns a new object,
 * it does not modify the one it's given.
 * 
 * parentObservable is an optional parameter for internal use by the library 
 * only. It is used to allow child objects/arrays to publish changes to their 
 * entire selves (as opposed to changes to one of their members).
 */
export function observable(val, parentObservable) {
    if (typeof val === "object" && val != null && !Object.hasOwnProperty(OBSERVABLE_HANDLES)) {
        const observableVal = Array.isArray(val) ? [] : {};

        // If this observable object is a member of an observable parent, make 
        // note of its observable symbol so that the child can publish its
        // entire self when appropriate
        if (parentObservable != null) {
            Object.defineProperty(observableVal, PARENT_OBSERVABLE, {
                value: parentObservable,
                writable: false,
                enumerable: false
            })
        }

        // Create a hidden property to store the observable symbols for each
        // of this object's observable properties
        Object.defineProperty(observableVal, OBSERVABLE_HANDLES, {
            value: {},
            writable: false,
            enumerable: false
        });
        
        // Create the observable symbols for each enumerable property
        for (const key in val) {
            observableVal[OBSERVABLE_HANDLES][key] = Symbol(key);
        }

        // Apply the proxy (see proxyHandler above)
        const proxy = new Proxy(observableVal, proxyHandler);

        // Copy the values from the original object into the new, proxied object
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                proxy.push(val[i]);
            }
        } else {
            for (const key of Object.keys(val)) {
                proxy[key] = val[key];
            }
        }

        return proxy;
    } else {
        return val;
    }
}

/**
 * This is how you create a tracked function. trackedFn is said tracked 
 * function; it should be a pure function that references observables from its 
 * scope and returns a value. That value will then be passed to effectFn, which
 * can have whatever side-effects you want.
 * 
 * Any change to any observables referenced by trackedFn will trigger both 
 * functions to be re-evaluated. In practice, this means effectFn will have 
 * another effect on the world. This is the key useful mechanism of this 
 * library.
 */
export function reaction(trackedFn, effectFn) {
    const reaction = function() {
        subscriptionsStore.beginTracking(reaction);
        const result = trackedFn();
        subscriptionsStore.completeTracking();
        effectFn(result);
    }

    reaction();
}

/**
 * An action is a function that mutates observables, but doesn't publish on 
 * intermediate states; it waits until the entire action has completed before
 * publishing. The two main benefits of this are:
 * 
 * 1) Consistency/atomicity. No partially-updated states will make it 
 * downstream to tracked functions.
 * 
 * 2) Performance. Changing multiple properties in sequence won't cause extra 
 * work to be done and then immediately discarded.
 */
export function action(fn) {
    return function(...args) {
        subscriptionsStore.beginAction();
        fn(...args);
        subscriptionsStore.completeAction();
    }
}

/**
 * A computed is a pure function that references observables (including other 
 * computed functions), and returns a value. Where this becomes valuable is the
 * fact that a computed function is both a tracked function and an observable
 * (which can be tracked by other tracked functions). So you can have computed 
 * functions that reference other computed functions, and each of those computed 
 * values will only be re-computed when one of its constituents changes. You
 * end up with a graph of derived values where, when a base observable changes,
 * only the parts of the graph that actually need to be re-computed get 
 * recomputed. This is where this paradigm really gets powerful.
 */
export function computed(fn) {
    
    // The computed function is an observable, so it needs an observable symbol
    const observableSymbol = Symbol(fn.name);
    
    // We store the most recently-computed value in scope. We then set up a 
    // reaction (see reaction() above) which tracks the user-supplied function,
    // and when it gets published, saves the new latest value in our cache.
    // If the value changed (via a simple triple-equals; we don't attempt a 
    // deep check), we publish on to this computed's subscribers.
    let cachedValue;
    reaction(
        fn,
        val => {
            const changed = val !== cachedValue;

            cachedValue = val;

            if (changed) {
                subscriptionsStore.publish(observableSymbol);
            }
        })

    // We track observers of this computed function's return value, so that they
    // can later be published to (above).
    return function() {
        subscriptionsStore.track(observableSymbol);
        return cachedValue;
    }
}
