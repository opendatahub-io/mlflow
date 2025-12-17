import pyspark


def get_delta_package() -> str:
    """
    Return a delta-spark Maven coordinate compatible with the installed pyspark.

    Spark 4.x (Scala 2.13) needs the _2.13 artifact; Spark 3.x (Scala 2.12)
    uses the _2.12 artifact.
    """
    major = int(pyspark.__version__.split(".")[0])
    scala_suffix = "2.13" if major >= 4 else "2.12"
    delta_version = "4.0.0" if major >= 4 else "3.2.0"
    return f"io.delta:delta-spark_{scala_suffix}:{delta_version}"
