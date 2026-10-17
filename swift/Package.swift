// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MisarPost",
    platforms: [
        .macOS(.v12),
        .iOS(.v15),
        .tvOS(.v15),
        .watchOS(.v8),
    ],
    products: [
        .library(
            name: "MisarPost",
            targets: ["MisarPost"]
        ),
    ],
    targets: [
        .target(
            name: "MisarPost",
            path: "Sources/MisarPost"
        ),
        .testTarget(
            name: "MisarPostTests",
            dependencies: ["MisarPost"],
            path: "Tests/MisarPostTests"
        ),
    ]
)
