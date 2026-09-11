from redis import Redis
from rq import Worker, Queue
from .config import settings


if __name__ == "__main__":
    Worker([Queue("inference", connection=Redis.from_url(settings.redis_url))], connection=Redis.from_url(settings.redis_url)).work()
