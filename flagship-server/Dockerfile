FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace
COPY pom.xml .
COPY flagship-shared/ flagship-shared/
COPY flagship-sdk/ flagship-sdk/
COPY flagship-server/ flagship-server/
COPY flagship-sample-app/ flagship-sample-app/
RUN apk add --no-cache maven && mvn -pl flagship-server -am package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /workspace/flagship-server/target/*.jar app.jar
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://localhost:8080/actuator/health/readiness || exit 1
ENTRYPOINT ["java", "-XX:+UseZGC", "-Xmx512m", "-jar", "app.jar"]
