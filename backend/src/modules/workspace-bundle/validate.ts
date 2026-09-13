import { findUnrunnableReason, validate } from '../ir';
import { isComposeFilename, MAX_TRACKED_COMPOSE_FILES } from './compose-files';
import type { WorkspaceCheck, WorkspacePlan } from './types';

const SERVICE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export function validateWorkspacePlan(plan: WorkspacePlan): WorkspaceCheck[] {
  const checks: WorkspaceCheck[] = [];
  const ids = new Set<string>();
  const hostPorts = new Set<number>();

  if (plan.services.length > 50) {
    checks.push(failed('service-count', 'A Workspace Plan can contain at most 50 services.'));
  } else {
    checks.push(passed('service-count', `${plan.services.length} service(s) stay within the workspace limit.`));
  }

  if (plan.version !== '0.1.0') {
    checks.push(failed('plan-version', 'Workspace Plan version must be 0.1.0.'));
  } else {
    checks.push(passed('plan-version', 'Workspace Plan version is supported.'));
  }

  if (!isSafeRelativePath(plan.workspacePath)) {
    checks.push(failed('workspace-path', 'Workspace path must be relative and contained.'));
  } else {
    checks.push(passed('workspace-path', 'Workspace path is portable.'));
  }

  const composeFiles = plan.existingComposeFiles;
  const composeInventoryValid =
    composeFiles.length <= MAX_TRACKED_COMPOSE_FILES &&
    new Set(composeFiles).size === composeFiles.length &&
    composeFiles.every((path) => {
      const filename = path.slice(path.lastIndexOf('/') + 1);
      return isSafeRelativePath(path) && isComposeFilename(filename);
    });
  checks.push(
    composeInventoryValid
      ? passed(
          'existing-compose-files',
          `${composeFiles.length} existing Compose file(s) have safe tracked paths.`,
        )
      : failed(
          'existing-compose-files',
          'Existing Compose files must be unique, safe relative Compose paths.',
        ),
  );

  for (const service of plan.services) {
    if (!SERVICE_ID.test(service.id) || ids.has(service.id)) {
      checks.push(failed(`service-${service.id}-id`, `Service id "${service.id}" is invalid or duplicated.`));
    } else {
      ids.add(service.id);
      checks.push(passed(`service-${service.id}-id`, `${service.id} has a portable unique id.`));
    }

    if (!isSafeRelativePath(service.path)) {
      checks.push(failed(`service-${service.id}-path`, `${service.id} has an unsafe relative path.`));
    } else {
      checks.push(passed(`service-${service.id}-path`, `${service.id} stays inside the workspace.`));
    }

    if (service.enabled) {
      const irErrors = validate(service.ir);
      const irValid = irErrors.length === 0;
      if (!irValid) {
        checks.push(failed(`service-${service.id}-ir`, `${service.id} has ${irErrors.length} invalid Pipeline IR field(s).`));
      } else {
        checks.push(passed(`service-${service.id}-ir`, `${service.id} has a valid Pipeline IR.`));
      }

      const portValid =
        Number.isInteger(service.containerPort) &&
        service.containerPort >= 1 &&
        service.containerPort <= 65535 &&
        Number.isInteger(service.hostPort) &&
        service.hostPort >= 1 &&
        service.hostPort <= 65535 &&
        !hostPorts.has(service.hostPort);
      if (!portValid) {
        checks.push(failed(`service-${service.id}-port`, `${service.id} has an invalid or duplicated host port.`));
      } else {
        hostPorts.add(service.hostPort);
        checks.push(passed(`service-${service.id}-port`, `${service.id} uses host port ${service.hostPort}.`));
      }

      if (service.stack !== 'vite' && service.startCommand.trim() === '') {
        checks.push(failed(`service-${service.id}-start`, `${service.id} needs a start command.`));
      } else {
        checks.push(passed(`service-${service.id}-start`, `${service.id} has a runtime start command.`));
      }
      const unrunnable = irValid ? findUnrunnableReason(service.ir) : null;
      if (!irValid) {
        checks.push(failed(`service-${service.id}-ready`, `${service.id} must have a valid Pipeline IR before containerization.`));
      } else if (unrunnable !== null) {
        const reason =
          unrunnable.kind === 'unresolved-required-field'
            ? `required field ${unrunnable.field} is unresolved`
            : unrunnable.explanation;
        checks.push(failed(`service-${service.id}-ready`, `${service.id} is not ready: ${reason}.`));
      } else if (
        service.stack === 'vite' &&
        !service.ir.stages.some((stage) => stage.id === 'build' && stage.enabled && stage.steps.length > 0)
      ) {
        checks.push(failed(`service-${service.id}-ready`, `${service.id} needs an enabled build command for its Vite image.`));
      } else {
        checks.push(passed(`service-${service.id}-ready`, `${service.id} is ready to containerize.`));
      }

      const forbidden = irValid ? service.ir.stages
        .flatMap((stage) => stage.steps)
        .find((step) => /\b(?:docker\s+push|kubectl|helm|terraform|pulumi|gcloud|aws\s|az\s)/i.test(step.run)) : undefined;
      if (forbidden !== undefined) {
        checks.push(failed(`service-${service.id}-cloud`, `${service.id} contains a publish or cloud command, which is outside this product scope.`));
      } else {
        checks.push(passed(`service-${service.id}-cloud`, `${service.id} contains no cloud or image-publish command.`));
      }
    } else {
      checks.push(passed(`service-${service.id}-excluded`, `${service.id} is excluded and will not affect this bundle.`));
    }
  }

  if (!plan.services.some((service) => service.enabled)) {
    checks.push(failed('enabled-services', 'Enable at least one service before generating.'));
  } else {
    checks.push(passed('enabled-services', 'At least one service is enabled.'));
  }

  return checks;
}

export function hasFailedChecks(checks: WorkspaceCheck[]): boolean {
  return checks.some((check) => check.status === 'failed');
}

export function isSafeRelativePath(path: string): boolean {
  if (path === '.') return true;
  if (path === '' || path.startsWith('/') || path.includes('\\')) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function passed(id: string, message: string): WorkspaceCheck {
  return { id, status: 'passed', message };
}

function failed(id: string, message: string): WorkspaceCheck {
  return { id, status: 'failed', message };
}
