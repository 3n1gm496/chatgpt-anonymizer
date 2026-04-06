from fastapi import APIRouter, HTTPException, Request

from local_engine.models.api_models import SanitizeRequestModel, SanitizeResponseModel

router = APIRouter(tags=["sanitize"])


@router.post(
    "/sanitize",
    response_model=SanitizeResponseModel,
    response_model_exclude_none=True,
)
async def sanitize(payload: SanitizeRequestModel, request: Request) -> SanitizeResponseModel:
    try:
        return request.app.state.service.sanitize(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
