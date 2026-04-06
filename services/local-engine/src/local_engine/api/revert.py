from fastapi import APIRouter, HTTPException, Request

from local_engine.models.api_models import RevertRequestModel, RevertResponseModel

router = APIRouter(tags=["revert"])


@router.post("/revert", response_model=RevertResponseModel)
async def revert(payload: RevertRequestModel, request: Request) -> RevertResponseModel:
    try:
        return request.app.state.service.revert(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
