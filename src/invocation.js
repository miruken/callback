import {
    Base, Flags, Delegate, Resolving
} from 'miruken-core';

import {
    Composition, HandleMethod, ResolveMethod
} from './callbacks';

import { CallbackHandler } from './handlers';

/**
 * InvocationOptions flags enum
 * @class InvocationOptions
 * @extends miruken.Flags
 */
export const InvocationOptions = Flags({
    /**
     * @property {number} None
     */
    None: 0,
    /**
     * Delivers invocation to all handlers.  At least one must recognize it.
     * @property {number} Broadcast
     */
    Broadcast: 1 << 0,
    /**
     * Marks invocation as optional.
     * @property {number} BestEffort
     */        
    BestEffort: 1 << 1,
    /**
     * Requires invocation to match conforming protocol.
     * @property {number} Strict
     */                
    Strict: 1 << 2,
    /**
     * Uses Resolve to determine instances to invoke.
     * @property {number} Resolve
     */
    Resolve: 1 << 3,
    /**
     * Publishes invocation to all handlers.
     * @property {number} Notify
     */                
    Notify: (1 << 0) | (1 << 1)
});

/**
 * Captures invocation semantics.
 * @class InvocationSemantics
 * @constructor
 * @param  {miruken.callback.InvocationOptions}  options  -  invocation options.
 * @extends Base
 */
export const InvocationSemantics = Composition.extend({
    constructor(options) {
        let _options   = InvocationOptions.None.addFlag(options),
            _specified = _options;
        this.extend({
            /**
             * Gets the invocation option.
             * @method getOption
             * @param   {miruken.callback.InvocationOption} option  -  option to test
             * @returns {boolean} true if invocation option enabled, false otherwise.
             */
            getOption(option) {
                return _options.hasFlag(option);
            },
            /**
             * Sets the invocation option.
             * @method setOption
             * @param   {miruken.callback.InvocationOption} option  -  option to set
             * @param   {boolean}  enabled  -  true if enable option, false to clear.
             */                
            setOption(option, enabled) {
                _options = enabled
                         ? _options.addFlag(option)
                         : _options.removeFlag(option);
                _specified = _specified.addFlag(option);
            },
            /**
             * Determines if the invocation option was specified.
             * @method getOption
             * @param   {miruken.callback.InvocationOption} option  -  option to test
             * @returns {boolean} true if invocation option specified, false otherwise.
             */                
            isSpecified(option) {
                return _specified.hasFlag(option);
            }
        });
    },
    /**
     * Merges invocation options into the supplied constraints. 
     * @method mergeInto
     * @param   {miruken.callback.InvocationSemantics}  semantics  -  receives invocation semantics
     */                
    mergeInto(semantics) {
        const items = InvocationOptions.items;
        for (let i = 0; i < items.length; ++i) {
            const option = +items[i];
            if (this.isSpecified(option) && !semantics.isSpecified(option)) {
                semantics.setOption(option, this.getOption(option));
            }
        }
    }
});

/**
 * Delegates properties and methods to a callback handler using 
 * {{#crossLink "miruken.callback.HandleMethod"}}{{/crossLink}}.
 * @class InvocationDelegate
 * @constructor
 * @param   {miruken.callback.CallbackHandler}  handler  -  forwarding handler 
 * @extends miruken.Delegate
 */
export const InvocationDelegate = Delegate.extend({
    constructor(handler) {
        this.extend({
            get handler() { return handler; }
        });
    },
    get(protocol, propertyName, strict) {
        return _delegateInvocation(this, HandleMethod.Get, protocol, propertyName, null, strict);
    },
    set(protocol, propertyName, propertyValue, strict) {
        return _delegateInvocation(this, HandleMethod.Set, protocol, propertyName, propertyValue, strict);
    },
    invoke(protocol, methodName, args, strict) {
        return _delegateInvocation(this, HandleMethod.Invoke, protocol, methodName, args, strict);
    }
});

function _delegateInvocation(delegate, type, protocol, methodName, args, strict) {
    let broadcast  = false,
        useResolve = false,
        bestEffort = false,
        handler    = delegate.handler;

    if (!handler.isCompositionScope) {
        const semantics = new InvocationSemantics();
        if (handler.handle(semantics, true)) {
            strict     = !!(strict | semantics.getOption(InvocationOptions.Strict));
            broadcast  = semantics.getOption(InvocationOptions.Broadcast);
            bestEffort = semantics.getOption(InvocationOptions.BestEffort);
            useResolve = semantics.getOption(InvocationOptions.Resolve)
                || protocol.conformsTo(Resolving);
        }
    }
    const handleMethod = useResolve
        ? new ResolveMethod(type, protocol, methodName, args, strict, broadcast, !bestEffort)
        : new HandleMethod(type, protocol, methodName, args, strict);
    if (!handler.handle(handleMethod, broadcast && !useResolve) && !bestEffort) {
        throw new TypeError(`Object ${handler} has no method '${methodName}'`);
    }
    return handleMethod.returnValue;
}

CallbackHandler.implement({
    /**
     * Converts the callback handler to a {{#crossLink "miruken.Delegate"}}{{/crossLink}}.
     * @method toDelegate
     * @returns {miruken.callback.InvocationDelegate}  delegate for this callback handler.
     */            
    toDelegate() { return new InvocationDelegate(this); },
    /**
     * Establishes strict invocation semantics.
     * @method $strict
     * @returns {miruken.callback.CallbackHandler} strict semantics.
     * @for miruken.callback.CallbackHandler
     */
    $strict() { return this.$callOptions(InvocationOptions.Strict); },
    /**
     * Establishes broadcast invocation semantics.
     * @method $broadcast
     * @returns {miruken.callback.CallbackHandler} broadcast semanics.
     * @for miruken.callback.CallbackHandler
     */        
    $broadcast() { return this.$callOptions(InvocationOptions.Broadcast); },
    /**
     * Establishes best-effort invocation semantics.
     * @method $bestEffort
     * @returns {miruken.callback.CallbackHandler} best-effort semanics.
     * @for miruken.callback.CallbackHandler
     */                
    $bestEffort() { return this.$callOptions(InvocationOptions.BestEffort); },
    /**
     * Establishes notification invocation semantics.
     * @method $notify
     * @returns {miruken.callback.InvocationOptionsHandler} notification semanics.
     * @for miruken.callback.CallbackHandler
     */
    $notify() { return this.$callOptions(InvocationOptions.Notify); },
    /**
     * Establishes resolve invocation semantics.
     * @method $resolve
     * @returns {miruken.callback.CallbackHandler} resolved semantics.
     * @for miruken.callback.CallbackHandler
     */
    $resolve() { return this.$callOptions(InvocationOptions.Resolve); },        
    /**
     * Establishes custom invocation semantics.
     * @method $callOptions
     * @param  {miruken.callback.InvocationOptions}  options  -  invocation semantics
     * @returns {miruken.callback.CallbackHandler} custom invocation semanics.
     * @for miruken.callback.CallbackHandler
     */                        
    $callOptions(options) {
        const semantics = new InvocationSemantics(options);
        return this.decorate({
            handleCallback(callback, greedy, composer) {
                let handled = false;
                if (callback instanceof InvocationSemantics) {
                    semantics.mergeInto(callback);
                    handled = true;
                } else if (!greedy) {
                    // Greedy must be false when resolving since Resolution.isMany
                    // represents greedy in that case
                    if (semantics.isSpecified(
                        InvocationOptions.Broadcast | InvocationOptions.Resolve)) {
                        greedy = semantics.getOption(InvocationOptions.Broadcast)
                            && !semantics.getOption(InvocationOptions.Resolve);
                    } else {
                        const inv = new InvocationSemantics();
                        if (this.handle(inv, true) &&
                            inv.isSpecified(InvocationOptions.Broadcast)) {
                            greedy = inv.getOption(InvocationOptions.Broadcast)
                                && !inv.getOption(InvocationOptions.Resolve);
                        }
                    }
                }
                if (greedy || !handled) {
                    handled = handled | this.base(callback, greedy, composer);
                }
                return !!handled;
            }
        });
    }    
});