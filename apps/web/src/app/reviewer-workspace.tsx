"use client";

import { useReviewerWorkspaceController } from "./reviewer-workspace-controller";
import {
  ReviewerAuthPanel,
  ReviewerDetailPanel,
  ReviewerHeader,
  ReviewerInboxPanel,
  ReviewerTimelinePanel
} from "./reviewer-workspace-panels";

export function ReviewerWorkspace() {
  const controller = useReviewerWorkspaceController();
  const { actions } = controller;

  return (
    <main className="app-shell" aria-busy={controller.operationActive}>
      <ReviewerHeader
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
      {controller.error ? (
        <p className="error-banner" role="alert">
          {controller.error}
        </p>
      ) : null}

      {!controller.actor || !controller.isReviewerActor ? (
        <ReviewerAuthPanel
          authEmail={controller.authEmail}
          authPassword={controller.authPassword}
          busy={controller.operationActive}
          onAuthEmailChange={actions.setAuthEmail}
          onSignIn={() => void actions.signIn()}
        />
      ) : (
        <div className="reviewer-grid">
          <ReviewerInboxPanel
            busy={controller.operationActive}
            inbox={controller.inbox}
            selectedRequestId={controller.selectedRequestId}
            onSelectRequest={(requestId) => void actions.loadDetail(requestId)}
          />
          <ReviewerDetailPanel
            busy={controller.operationActive}
            detail={controller.detail}
            rejectionReason={controller.rejectionReason}
            onApproveRequest={() => void actions.approveRequest()}
            onRejectRequest={() => void actions.rejectRequest()}
            onRejectionReasonChange={actions.setRejectionReason}
            onStartReview={() => void actions.startReview()}
          />
          <ReviewerTimelinePanel detail={controller.detail} />
        </div>
      )}
    </main>
  );
}
