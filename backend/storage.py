import os

LOCAL_STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)


def _s3_client():
    bucket = os.environ.get("AWS_S3_BUCKET")
    if not bucket:
        return None, None
    import boto3
    client = boto3.client(
        "s3",
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )
    return client, bucket


def save_file(filename: str, data: bytes) -> str:
    """Save bytes to S3 if configured, else to local disk. Returns a reference path/URL."""
    client, bucket = _s3_client()
    if client:
        client.put_object(Bucket=bucket, Key=filename, Body=data)
        return f"s3://{bucket}/{filename}"
    path = os.path.join(LOCAL_STORAGE_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    return path


def load_file(filename: str) -> bytes:
    client, bucket = _s3_client()
    if client:
        obj = client.get_object(Bucket=bucket, Key=filename)
        return obj["Body"].read()
    path = os.path.join(LOCAL_STORAGE_DIR, filename)
    with open(path, "rb") as fh:
        return fh.read()
