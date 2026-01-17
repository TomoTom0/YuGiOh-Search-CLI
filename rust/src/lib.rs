pub mod normalize;
pub mod search;
pub mod faq;

#[cfg(feature = "workers")]
pub mod workers;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
