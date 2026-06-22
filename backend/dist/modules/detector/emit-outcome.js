"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitOutcome = emitOutcome;
const types_1 = require("./types");
function emitOutcome(c, ctx) {
    if (c.confidence === 'high') {
        return outcomeFromEmission(c.emit(ctx));
    }
    switch (c.onUncertainty) {
        case 'omit':
            return collapseIfRequired(c, ctx, { kind: 'nothing' });
        case 'assume-default':
            return collapseIfRequired(c, ctx, defaultedCommitted(c, ctx));
        case 'needs-user-input': {
            const emission = c.emit(ctx);
            if (emission.kind !== 'field') {
                return collapseIfRequired(c, ctx, { kind: 'nothing' });
            }
            return {
                kind: 'unresolved',
                field: emission.target,
                message: messageOrSynthesized(c.message, emission.target),
            };
        }
    }
}
function outcomeFromEmission(em) {
    return em.kind === 'field'
        ? { kind: 'committed', value: em.value }
        : { kind: 'committed-stage', stage: em.stage };
}
function defaultedCommitted(c, ctx) {
    if (c.default !== undefined) {
        return { kind: 'committed', value: c.default };
    }
    return outcomeFromEmission(c.emit(ctx));
}
function collapseIfRequired(c, ctx, candidate) {
    if (candidate.kind !== 'nothing')
        return candidate;
    if (c.emit === undefined)
        return candidate;
    let target;
    try {
        const em = c.emit(ctx);
        if (em.kind === 'field')
            target = em.target;
    }
    catch {
        return candidate;
    }
    if (target === undefined)
        return candidate;
    if (!types_1.REQUIRED_NULLABLE_FIELDS.includes(target))
        return candidate;
    return {
        kind: 'unresolved',
        field: target,
        message: messageOrSynthesized(c.message, target),
    };
}
function messageOrSynthesized(message, field) {
    if (message !== undefined && message.length > 0)
        return message;
    return `Could not determine value for ${field}; please specify.`;
}
//# sourceMappingURL=emit-outcome.js.map