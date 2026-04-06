import pytest

from local_engine.storage.process_lock import (
    EngineProcessLock,
    EngineProcessLockError,
)


def test_process_lock_blocks_a_second_owner_until_released(tmp_path):
    first = EngineProcessLock.acquire(tmp_path)

    with pytest.raises(EngineProcessLockError):
        EngineProcessLock.acquire(tmp_path)

    first.release()

    second = EngineProcessLock.acquire(tmp_path)
    second.release()
