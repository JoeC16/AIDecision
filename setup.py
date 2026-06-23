from setuptools import setup, find_packages

setup(
    name="aidecision",
    version="0.1.0",
    description="A Python SDK for capturing, storing, and analyzing AI decision events.",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="AIDecision Contributors",
    license="MIT",
    packages=find_packages(exclude=["tests*"]),
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
)
