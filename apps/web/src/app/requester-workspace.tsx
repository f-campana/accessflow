"use client";

import { useRequesterWorkspaceController } from "./requester-workspace-controller";
import {
  AuthPanel,
  AuditTimelinePanel,
  RequesterHeader,
  RequestPanel,
  StudyPanel
} from "./requester-workspace-panels";

export function RequesterWorkspace() {
  const controller = useRequesterWorkspaceController();
  const { actions } = controller;

  return (
    <main className="app-shell" aria-busy={controller.operationActive}>
      <RequesterHeader
        actor={controller.actor}
        busy={controller.operationActive}
        onSignOut={() => void actions.signOut()}
      />

      {controller.operationStatus ? (
        <p
          className="status-line"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {controller.operationStatus}
        </p>
      ) : null}
      {controller.notice ? (
        <p className="notice" role="status" aria-atomic="true">
          {controller.notice}
        </p>
      ) : null}
      {controller.authError ? (
        <p className="error-banner" role="alert">
          {controller.authError}
        </p>
      ) : null}

      {!controller.actor ? (
        <AuthPanel
          authEmail={controller.authEmail}
          authName={controller.authName}
          authPassword={controller.authPassword}
          busy={controller.operationActive}
          onAuthenticate={(mode) => void actions.authenticate(mode)}
          onAuthEmailChange={actions.setAuthEmail}
          onAuthNameChange={actions.setAuthName}
        />
      ) : (
        <div className="workspace-grid">
          <StudyPanel
            access={controller.access}
            busy={controller.operationActive}
            canRetryRefresh={controller.canRetryRefresh}
            selectedStudy={controller.selectedStudy}
            selectedStudyId={controller.selectedStudyId}
            studies={controller.studies}
            onCreateDraft={() => void actions.createDraft()}
            onSelectStudy={(studyId) => void actions.selectStudy(studyId)}
          />
          <RequestPanel
            access={controller.access}
            busy={controller.operationActive}
            canRetryRefresh={controller.canRetryRefresh}
            draftCommandInFlight={controller.draftCommandInFlight}
            draftFieldsEditable={controller.draftFieldsEditable}
            draftForm={controller.draftForm}
            draftId={controller.draftId}
            error={controller.error}
            isDraft={controller.isDraft}
            onRetryRefresh={() => void actions.retrySelectedStudyRefresh()}
            onSaveDraft={() => void actions.saveDraft()}
            onSubmitRequest={() => void actions.submitRequest()}
            onUpdateDraft={actions.updateDraft}
          />
          <AuditTimelinePanel access={controller.access} />
        </div>
      )}
    </main>
  );
}
