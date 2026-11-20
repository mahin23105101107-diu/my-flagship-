package io.flagship.server;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.elements.StaticRuleDefinition.noClasses;

@AnalyzeClasses(packages = "io.flagship.server", importOptions = ImportOption.DoNotIncludeTests.class)
public class ArchitectureTest {

    @ArchTest
    static final ArchRule commonModuleShouldNotDependOnFeatureModules =
        noClasses()
            .that().resideInAPackage("..common..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("..approval..", "..flag..", "..sdk..");

    @ArchTest
    static final ArchRule authModuleShouldRemainIndependentOfApprovalAndSdk =
        noClasses()
            .that().resideInAPackage("..auth..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("..approval..", "..sdk..");
}
