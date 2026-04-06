from fastapi import APIRouter, HTTPException, Request

from local_engine.models.api_models import (
    ResetSessionRequestModel,
    ResetSessionResponseModel,
    SessionSummaryModel,
)

router = APIRouter(tags=["sessions"])


@router.post("/sessions/reset", response_model=ResetSessionResponseModel)
async def reset_session(
    payload: ResetSessionRequestModel, request: Request
) -> ResetSessionResponseModel:
    return request.app.state.service.reset_session(payload)


@router.get("/sessions/{session_id}", response_model=SessionSummaryModel)
async def get_session(session_id: str, request: Request) -> SessionSummaryModel:
    try:
        return request.app.state.service.get_session_summary(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
